import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient, ApiError } from '../api/client';
import { Layout } from '../components/Layout';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAuth } from '../context/AuthContext';

const ALLOWED_DURATIONS = [15, 20, 30];
const SLOT_RE = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

function parseMinutes(hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh * 60 + mm;
}

function formatMinutes(total) {
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function generateDefaultSlots(durationMinutes) {
  const start = parseMinutes('09:00');
  const end = parseMinutes('12:00');
  const slots = [];
  for (let t = start; t + durationMinutes <= end; t += durationMinutes) {
    slots.push(`${formatMinutes(t)}-${formatMinutes(t + durationMinutes)}`);
  }
  return slots;
}

function isValidSlotString(slot) {
  if (typeof slot !== 'string' || !SLOT_RE.test(slot)) return false;
  const [startStr, endStr] = slot.split('-');
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  if (sh < 0 || sh > 23 || sm < 0 || sm > 59 || eh < 0 || eh > 23 || em < 0 || em > 59) {
    return false;
  }
  return parseMinutes(endStr) > parseMinutes(startStr);
}

function slotDurationMinutesOf(slot) {
  if (!isValidSlotString(slot)) return 0;
  const [startStr, endStr] = slot.split('-');
  return parseMinutes(endStr) - parseMinutes(startStr);
}

function buildSlotOptions(duration, apiSlots = [], interviewers = []) {
  const set = new Set();
  const baseSlots = generateDefaultSlots(duration);
  baseSlots.forEach((s) => set.add(s));
  apiSlots.forEach((s) => {
    if (isValidSlotString(s) && slotDurationMinutesOf(s) === duration) {
      set.add(s);
    }
  });
  interviewers.forEach((iv) => {
    (iv.availableSlots || []).forEach((s) => {
      if (isValidSlotString(s)) {
        set.add(s);
      }
    });
  });
  return [...set].sort();
}

function setupToFormState(setup) {
  const duration = ALLOWED_DURATIONS.includes(setup?.slotDurationMinutes)
    ? setup.slotDurationMinutes
    : 20;
  const validPosIds = new Set((setup?.positions || []).map((p) => p.id));
  const validRoomIds = new Set((setup?.rooms || []).map((r) => r.id));
  const interviewers = Array.isArray(setup?.interviewers)
    ? setup.interviewers.map((iv) => ({
        id: iv.id,
        name: iv.name,
        email: iv.email,
        positionIds: Array.isArray(iv.positionIds)
          ? iv.positionIds.filter((pid) => validPosIds.has(pid))
          : [],
        availableSlots: Array.isArray(iv.availableSlots) ? [...iv.availableSlots] : []
      }))
    : [];

  return {
    slotDurationMinutes: duration,
    selectedRoomIds: Array.isArray(setup?.selectedRoomIds)
      ? setup.selectedRoomIds.filter((rid) => validRoomIds.has(rid))
      : [],
    interviewers,
    slotOptions: buildSlotOptions(duration, setup?.availableSlots || [], interviewers)
  };
}

function validateInterviewSetup(form, setup) {
  const errors = {};
  const validRoomIds = new Set((setup?.rooms || []).map((r) => r.id));
  const validPosIds = new Set((setup?.positions || []).map((p) => p.id));

  if (!ALLOWED_DURATIONS.includes(Number(form.slotDurationMinutes))) {
    errors.slotDurationMinutes = 'Slot duration must be 15, 20, or 30 minutes.';
  }

  if (!Array.isArray(form.selectedRoomIds) || form.selectedRoomIds.length === 0) {
    errors.selectedRoomIds = 'Select at least one interview room.';
  } else if (form.selectedRoomIds.some((id) => !validRoomIds.has(id))) {
    errors.selectedRoomIds = 'Selected rooms must exist in the room list.';
  }

  if (!Array.isArray(form.interviewers) || form.interviewers.length === 0) {
    errors.interviewers = 'At least one interviewer is required.';
  } else {
    form.interviewers.forEach((iv, idx) => {
      if (!Array.isArray(iv.positionIds) || iv.positionIds.length === 0) {
        errors[`interviewers[${idx}].positionIds`] = `Assign at least one position to ${iv.name}.`;
      } else if (iv.positionIds.some((pid) => !validPosIds.has(pid))) {
        errors[`interviewers[${idx}].positionIds`] = `Select valid positions for ${iv.name}.`;
      }

      if (!Array.isArray(iv.availableSlots) || iv.availableSlots.length === 0) {
        errors[`interviewers[${idx}].availableSlots`] = `Select at least one available slot for ${iv.name}.`;
      } else if (iv.availableSlots.some((s) => !isValidSlotString(s))) {
        errors[`interviewers[${idx}].availableSlots`] = 'All slots must use valid HH:MM-HH:MM format.';
      }
    });
  }

  return errors;
}

export function ExecutiveInterviewSetupPage() {
  const { token } = useAuth();
  const [setup, setSetup] = useState(null);
  const [form, setForm] = useState(() => setupToFormState(null));
  const [customSlots, setCustomSlots] = useState({});
  const [customSlotErrors, setCustomSlotErrors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);

  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formBanner, setFormBanner] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isSubmittingRef = useRef(false);
  const fieldRefs = useRef({});

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError('');

    apiClient
      .get('/api/interview-setup', { token, signal: controller.signal })
      .then((data) => {
        const loaded = data?.setup || null;
        setSetup(loaded);
        setForm(setupToFormState(loaded));
        setFieldErrors({});
        setCustomSlotErrors({});
        setFormBanner(null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') return;
        setLoadError(err?.message || 'Unable to load interview setup.');
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [token, reloadCount]);

  const handleRetry = useCallback(() => {
    setReloadCount((n) => n + 1);
  }, []);

  const isReadOnly = Boolean(setup?.isReadOnly);

  const hasEmptyResources = useMemo(() => {
    if (!setup) return false;
    return (
      (setup.rooms || []).length === 0 ||
      (setup.positions || []).length === 0 ||
      (setup.interviewers || []).length === 0
    );
  }, [setup]);

  const registerFieldRef = (key) => (el) => {
    if (el) {
      fieldRefs.current[key] = el;
    } else {
      delete fieldRefs.current[key];
    }
  };

  const focusFirstError = (errors) => {
    const firstKey = Object.keys(errors)[0];
    if (firstKey && fieldRefs.current[firstKey]) {
      fieldRefs.current[firstKey].focus();
    }
  };

  const revalidateIfNeeded = (nextForm) => {
    if (hasAttemptedSubmit && setup) {
      setFieldErrors(validateInterviewSetup(nextForm, setup));
    }
  };

  const handleDurationChange = (e) => {
    if (isReadOnly || submitting) return;
    const nextDuration = Number(e.target.value);
    const defaultGrid = generateDefaultSlots(nextDuration);
    const customMatching = form.slotOptions.filter(
      (s) => !defaultGrid.includes(s) && slotDurationMinutesOf(s) === nextDuration
    );
    const nextOptions = [...new Set([...defaultGrid, ...customMatching])].sort();
    const nextInterviewers = form.interviewers.map((iv) => {
      const matching = iv.availableSlots.filter(
        (s) => slotDurationMinutesOf(s) === nextDuration
      );
      return {
        ...iv,
        availableSlots: matching
      };
    });
    const nextForm = {
      ...form,
      slotDurationMinutes: nextDuration,
      interviewers: nextInterviewers,
      slotOptions: nextOptions
    };
    setForm(nextForm);
    setCustomSlotErrors({});
    setFormBanner({
      type: 'info',
      title: `Slot duration set to ${nextDuration} minutes`,
      message: 'Time slot options were updated for the new interval. Confirm each interviewer’s selected slots below before saving.'
    });
    revalidateIfNeeded(nextForm);
  };

  const handleToggleRoom = (roomId) => {
    if (isReadOnly || submitting) return;
    const exists = form.selectedRoomIds.includes(roomId);
    const nextRoomIds = exists
      ? form.selectedRoomIds.filter((id) => id !== roomId)
      : [...form.selectedRoomIds, roomId];
    const nextForm = { ...form, selectedRoomIds: nextRoomIds };
    setForm(nextForm);
    setFormBanner(null);
    if (hasAttemptedSubmit) {
      revalidateIfNeeded(nextForm);
    } else if (fieldErrors.selectedRoomIds) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy.selectedRoomIds;
        return copy;
      });
    }
  };

  const handleToggleInterviewerPosition = (ivIdx, posId) => {
    if (isReadOnly || submitting) return;
    const nextInterviewers = form.interviewers.map((iv, idx) => {
      if (idx !== ivIdx) return iv;
      const exists = iv.positionIds.includes(posId);
      return {
        ...iv,
        positionIds: exists
          ? iv.positionIds.filter((id) => id !== posId)
          : [...iv.positionIds, posId]
      };
    });
    const nextForm = { ...form, interviewers: nextInterviewers };
    setForm(nextForm);
    setFormBanner(null);
    const errKey = `interviewers[${ivIdx}].positionIds`;
    if (hasAttemptedSubmit) {
      revalidateIfNeeded(nextForm);
    } else if (fieldErrors[errKey]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[errKey];
        return copy;
      });
    }
  };

  const handleToggleInterviewerSlot = (ivIdx, slot) => {
    if (isReadOnly || submitting) return;
    const nextInterviewers = form.interviewers.map((iv, idx) => {
      if (idx !== ivIdx) return iv;
      const exists = iv.availableSlots.includes(slot);
      const nextSlots = exists
        ? iv.availableSlots.filter((s) => s !== slot)
        : [...iv.availableSlots, slot].sort();
      return {
        ...iv,
        availableSlots: nextSlots
      };
    });
    const nextForm = { ...form, interviewers: nextInterviewers };
    setForm(nextForm);
    setFormBanner(null);
    const errKey = `interviewers[${ivIdx}].availableSlots`;
    if (hasAttemptedSubmit) {
      revalidateIfNeeded(nextForm);
    } else if (fieldErrors[errKey]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[errKey];
        return copy;
      });
    }
  };

  const handleSelectAllSlotsForInterviewer = (ivIdx) => {
    if (isReadOnly || submitting) return;
    const nextInterviewers = form.interviewers.map((iv, idx) =>
      idx === ivIdx ? { ...iv, availableSlots: [...form.slotOptions] } : iv
    );
    const nextForm = { ...form, interviewers: nextInterviewers };
    setForm(nextForm);
    setFormBanner(null);
    const errKey = `interviewers[${ivIdx}].availableSlots`;
    if (hasAttemptedSubmit) {
      revalidateIfNeeded(nextForm);
    } else if (fieldErrors[errKey]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[errKey];
        return copy;
      });
    }
  };

  const handleClearSlotsForInterviewer = (ivIdx) => {
    if (isReadOnly || submitting) return;
    const nextInterviewers = form.interviewers.map((iv, idx) =>
      idx === ivIdx ? { ...iv, availableSlots: [] } : iv
    );
    const nextForm = { ...form, interviewers: nextInterviewers };
    setForm(nextForm);
    setFormBanner(null);
    revalidateIfNeeded(nextForm);
  };

  const handleAddCustomSlot = (ivIdx) => {
    if (isReadOnly || submitting) return;
    const iv = form.interviewers[ivIdx];
    const raw = (customSlots[iv.id] || '').trim();
    if (!isValidSlotString(raw)) {
      setCustomSlotErrors((prev) => ({
        ...prev,
        [iv.id]: 'Enter a valid time range in HH:MM-HH:MM format (end time after start time).'
      }));
      return;
    }
    if (slotDurationMinutesOf(raw) !== form.slotDurationMinutes) {
      setCustomSlotErrors((prev) => ({
        ...prev,
        [iv.id]: `Custom slot must match the selected ${form.slotDurationMinutes}-minute duration.`
      }));
      return;
    }

    const nextOptions = form.slotOptions.includes(raw)
      ? form.slotOptions
      : [...form.slotOptions, raw].sort();

    const nextInterviewers = form.interviewers.map((item, idx) => {
      if (idx !== ivIdx) return item;
      const nextSlots = item.availableSlots.includes(raw)
        ? item.availableSlots
        : [...item.availableSlots, raw].sort();
      return { ...item, availableSlots: nextSlots };
    });

    const nextForm = {
      ...form,
      slotOptions: nextOptions,
      interviewers: nextInterviewers
    };
    setForm(nextForm);
    setCustomSlots((prev) => ({ ...prev, [iv.id]: '' }));
    setCustomSlotErrors((prev) => ({ ...prev, [iv.id]: '' }));
    setFormBanner(null);
    const errKey = `interviewers[${ivIdx}].availableSlots`;
    if (hasAttemptedSubmit) {
      revalidateIfNeeded(nextForm);
    } else if (fieldErrors[errKey]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[errKey];
        return copy;
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isReadOnly || isSubmittingRef.current || !setup) return;

    setHasAttemptedSubmit(true);
    setFormBanner(null);

    const clientErrors = validateInterviewSetup(form, setup);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setFormBanner({
        type: 'danger',
        title: 'Cannot save interview setup',
        message: 'Please resolve the highlighted errors below.'
      });
      focusFirstError(clientErrors);
      return;
    }

    isSubmittingRef.current = true;
    setSubmitting(true);
    setFieldErrors({});

    try {
      const payload = {
        slotDurationMinutes: Number(form.slotDurationMinutes),
        selectedRoomIds: form.selectedRoomIds,
        interviewers: form.interviewers.map((iv) => ({
          id: iv.id,
          positionIds: iv.positionIds,
          availableSlots: iv.availableSlots
        }))
      };

      const data = await apiClient.put('/api/interview-setup', payload, { token });
      const updated = data?.setup || null;
      setSetup(updated);
      setForm(setupToFormState(updated));
      setHasAttemptedSubmit(false);
      setFormBanner({
        type: 'success',
        title: 'Interview setup saved',
        message: 'Slot duration, interview rooms, interviewer positions, and available slots have been updated.'
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'SCHEDULE_CONFIRMED') {
        setSetup((prev) => (prev ? { ...prev, isReadOnly: true } : prev));
        setFormBanner({
          type: 'warning',
          title: 'Interview Setup Locked (Read-Only)',
          message: err.message || 'The interview schedule is confirmed, so setup cannot be changed.'
        });
      } else if (
        err instanceof ApiError &&
        err.status === 400 &&
        err.fields &&
        Object.keys(err.fields).length > 0
      ) {
        setFieldErrors(err.fields);
        setFormBanner({
          type: 'danger',
          title: 'Invalid interview setup',
          message: err.message || 'Please fix the highlighted fields.'
        });
        focusFirstError(err.fields);
      } else {
        setFormBanner({
          type: 'danger',
          title: 'Unable to save setup',
          message: err?.message || 'An error occurred while saving interview setup. Your selections have been kept.'
        });
      }
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Layout title="Interview Setup" topbarLabel="Executive · Step C4">
      <div className="page-header">
        <div className="page-header-top">
          <div>
            <h1>Interview Setup</h1>
            <p className="page-subtitle">
              Assign interviewers to campaign positions, manage available time slots, choose rooms, and set slot duration.
            </p>
          </div>
          {!isLoading && !loadError && setup && (
            <span className={isReadOnly ? 'badge badge-warning' : 'badge badge-info'}>
              {isReadOnly ? 'Confirmed · Read-Only' : `Interview Date: ${setup.interviewDate || 'Not set'}`}
            </span>
          )}
        </div>
      </div>

      {isLoading && (
        <LoadingState
          title="Loading interview setup"
          message="Fetching interview rooms, positions, time slots, and interviewers..."
        />
      )}

      {!isLoading && loadError && (
        <ErrorState
          title="Unable to load interview setup"
          message={loadError}
          onRetry={handleRetry}
        />
      )}

      {!isLoading && !loadError && !setup && (
        <EmptyState
          title="No interview setup available"
          message="No interview setup configuration is available for this campaign yet."
          action={{ to: '/executive/campaign', label: 'Review Campaign Setup' }}
        />
      )}

      {!isLoading && !loadError && setup && (
        <>
          {isReadOnly && (
            <div className="alert alert-warning" role="status" aria-label="Read-only schedule lock">
              <div className="alert-content">
                <div className="alert-title">Interview Setup Locked (Schedule Confirmed)</div>
                <p style={{ marginBottom: 0 }}>
                  The interview schedule is confirmed in Step C9, so slot duration, rooms, and interviewer assignments are read-only.
                </p>
              </div>
              <Link to="/executive/scheduling" className="btn btn-outline">
                View Confirmed Schedule
              </Link>
            </div>
          )}

          {formBanner && (
            <div
              className={`alert alert-${formBanner.type}`}
              role={formBanner.type === 'danger' ? 'alert' : 'status'}
            >
              <div className="alert-content">
                <div className="alert-title">{formBanner.title}</div>
                <p style={{ marginBottom: 0 }}>{formBanner.message}</p>
              </div>
              {formBanner.type === 'success' && (
                <Link to="/executive/scheduling" className="btn btn-outline">
                  Continue to Scheduling
                </Link>
              )}
            </div>
          )}

          <div className="stats-grid" aria-label="Interview setup counts">
            <div className="stat-card">
              <div className="stat-value">{(setup.rooms || []).length}</div>
              <div className="stat-label">Available Rooms ({form.selectedRoomIds.length} selected)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{(setup.positions || []).length}</div>
              <div className="stat-label">Campaign Positions</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{form.interviewers.length}</div>
              <div className="stat-label">Interviewers</div>
            </div>
            <div className="stat-card stat-success">
              <div className="stat-value">{hasEmptyResources ? 0 : form.slotDurationMinutes}</div>
              <div className="stat-label">
                {hasEmptyResources ? 'Slot Duration (min)' : 'Minutes per Interview Slot'}
              </div>
            </div>
          </div>

          {hasEmptyResources ? (
            <EmptyState
              title="Interview setup resources are empty"
              message="There are 0 rooms, positions, or interviewers available to configure right now. Ensure your campaign has positions published and interviewers/rooms configured."
              action={{ to: '/executive/campaign', label: 'Review Campaign Setup' }}
            />
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <section className="card" aria-labelledby="setup-duration-rooms-heading">
                <h2 id="setup-duration-rooms-heading">Slot Duration &amp; Interview Rooms</h2>
                <p className="text-muted">
                  Set one uniform interview slot duration across the campaign and select rooms from the pre-configured list.
                </p>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="slot-duration-select">
                      Campaign Slot Duration <span className="required-mark" aria-hidden="true">*</span>
                    </label>
                    <select
                      ref={registerFieldRef('slotDurationMinutes')}
                      id="slot-duration-select"
                      name="slotDurationMinutes"
                      value={form.slotDurationMinutes}
                      onChange={handleDurationChange}
                      aria-invalid={Boolean(fieldErrors.slotDurationMinutes)}
                      aria-describedby={
                        fieldErrors.slotDurationMinutes ? 'slotDurationMinutes-error' : 'slotDurationMinutes-hint'
                      }
                      disabled={isReadOnly || submitting}
                    >
                      {ALLOWED_DURATIONS.map((mins) => (
                        <option key={mins} value={mins}>
                          {mins} minutes
                        </option>
                      ))}
                    </select>
                    <p id="slotDurationMinutes-hint" className="form-hint">
                      Choose 15, 20, or 30 minutes per interview slot on {setup.interviewDate}.
                    </p>
                    {fieldErrors.slotDurationMinutes && (
                      <p id="slotDurationMinutes-error" className="field-error">
                        {fieldErrors.slotDurationMinutes}
                      </p>
                    )}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <fieldset
                      className="setup-fieldset"
                      aria-describedby={fieldErrors.selectedRoomIds ? 'selectedRoomIds-error' : undefined}
                    >
                      <legend className="fieldset-legend">
                        Select Interview Rooms ({form.selectedRoomIds.length} selected){' '}
                        <span className="required-mark" aria-hidden="true">*</span>
                      </legend>
                      <div className="checkbox-list">
                        {(setup.rooms || []).map((room, rIdx) => {
                          const checked = form.selectedRoomIds.includes(room.id);
                          return (
                            <label
                              key={room.id}
                              htmlFor={`room-${room.id}`}
                              className={`checkbox-tile${checked ? ' is-selected' : ''}`}
                            >
                              <input
                                ref={rIdx === 0 ? registerFieldRef('selectedRoomIds') : undefined}
                                id={`room-${room.id}`}
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggleRoom(room.id)}
                                aria-invalid={Boolean(fieldErrors.selectedRoomIds)}
                                aria-describedby={
                                  fieldErrors.selectedRoomIds ? 'selectedRoomIds-error' : undefined
                                }
                                disabled={isReadOnly || submitting}
                              />
                              <span className="checkbox-tile-text">
                                <strong>{room.name}</strong>
                                <span className="form-hint" style={{ marginTop: 0 }}>
                                  {room.location}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {fieldErrors.selectedRoomIds && (
                        <p id="selectedRoomIds-error" className="field-error">
                          {fieldErrors.selectedRoomIds}
                        </p>
                      )}
                    </fieldset>
                  </div>
                </div>
              </section>

              <section className="card" aria-labelledby="setup-interviewers-heading">
                <h2 id="setup-interviewers-heading">Interviewer Assignments &amp; Available Slots</h2>
                <p className="text-muted">
                  Assign each interviewer to one or more campaign positions and select their available interview slots.
                </p>

                {fieldErrors.interviewers && (
                  <p id="interviewers-error" className="field-error" role="alert" style={{ marginBottom: '16px' }}>
                    {fieldErrors.interviewers}
                  </p>
                )}

                <div className="positions-stack">
                  {form.interviewers.map((iv, ivIdx) => {
                    const posErrKey = `interviewers[${ivIdx}].positionIds`;
                    const slotsErrKey = `interviewers[${ivIdx}].availableSlots`;
                    const idErrKey = `interviewers[${ivIdx}].id`;

                    return (
                      <article
                        key={iv.id}
                        className="position-row-card"
                        aria-labelledby={`interviewer-heading-${iv.id}`}
                      >
                        <div className="position-row-header">
                          <div>
                            <h3 id={`interviewer-heading-${iv.id}`}>{iv.name}</h3>
                            <p className="form-hint" style={{ marginTop: 0 }}>
                              {iv.email}
                            </p>
                          </div>
                          <div className="header-actions">
                            <span className="badge badge-info">
                              {iv.positionIds.length} position{iv.positionIds.length === 1 ? '' : 's'}
                            </span>
                            <span className="badge badge-success">
                              {iv.availableSlots.length} slot{iv.availableSlots.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>

                        {fieldErrors[idErrKey] && (
                          <p className="field-error" style={{ marginBottom: '12px' }}>
                            {fieldErrors[idErrKey]}
                          </p>
                        )}

                        <div className="form-group">
                          <fieldset
                            className="setup-fieldset"
                            aria-describedby={fieldErrors[posErrKey] ? `iv-${ivIdx}-pos-error` : undefined}
                          >
                            <legend className="fieldset-legend">
                              Assigned Positions <span className="required-mark" aria-hidden="true">*</span>
                            </legend>
                            <div className="checkbox-grid">
                              {(setup.positions || []).map((pos, pIdx) => {
                                const checked = iv.positionIds.includes(pos.id);
                                return (
                                  <label
                                    key={pos.id}
                                    htmlFor={`iv-${ivIdx}-pos-${pos.id}`}
                                    className={`checkbox-tile${checked ? ' is-selected' : ''}`}
                                  >
                                    <input
                                      ref={pIdx === 0 ? registerFieldRef(posErrKey) : undefined}
                                      id={`iv-${ivIdx}-pos-${pos.id}`}
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => handleToggleInterviewerPosition(ivIdx, pos.id)}
                                      aria-invalid={Boolean(fieldErrors[posErrKey])}
                                      aria-describedby={
                                        fieldErrors[posErrKey] ? `iv-${ivIdx}-pos-error` : undefined
                                      }
                                      disabled={isReadOnly || submitting}
                                    />
                                    <span className="checkbox-tile-text">
                                      <strong>{pos.title}</strong>
                                      <span className="form-hint" style={{ marginTop: 0 }}>
                                        {pos.department}
                                      </span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                            {fieldErrors[posErrKey] && (
                              <p id={`iv-${ivIdx}-pos-error`} className="field-error">
                                {fieldErrors[posErrKey]}
                              </p>
                            )}
                          </fieldset>
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <div className="section-header-row" style={{ marginBottom: '8px' }}>
                            <span className="fieldset-legend" style={{ marginBottom: 0 }}>
                              Available Slots ({form.slotDurationMinutes} min){' '}
                              <span className="required-mark" aria-hidden="true">*</span>
                            </span>
                            <div className="header-actions">
                              <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => handleSelectAllSlotsForInterviewer(ivIdx)}
                                disabled={isReadOnly || submitting}
                              >
                                Select All
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => handleClearSlotsForInterviewer(ivIdx)}
                                disabled={isReadOnly || submitting}
                              >
                                Clear Slots
                              </button>
                            </div>
                          </div>

                          <fieldset
                            className="setup-fieldset"
                            aria-describedby={fieldErrors[slotsErrKey] ? `iv-${ivIdx}-slots-error` : undefined}
                          >
                            <legend className="sr-only">
                              Available interview time slots for {iv.name}
                            </legend>
                            <div className="slot-grid">
                              {form.slotOptions.map((slot, sIdx) => {
                                const checked = iv.availableSlots.includes(slot);
                                return (
                                  <label
                                    key={slot}
                                    htmlFor={`iv-${ivIdx}-slot-${slot}`}
                                    className={`checkbox-tile slot-tile${checked ? ' is-selected' : ''}`}
                                  >
                                    <input
                                      ref={sIdx === 0 ? registerFieldRef(slotsErrKey) : undefined}
                                      id={`iv-${ivIdx}-slot-${slot}`}
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => handleToggleInterviewerSlot(ivIdx, slot)}
                                      aria-invalid={Boolean(fieldErrors[slotsErrKey])}
                                      aria-describedby={
                                        fieldErrors[slotsErrKey] ? `iv-${ivIdx}-slots-error` : undefined
                                      }
                                      disabled={isReadOnly || submitting}
                                    />
                                    <span>{slot}</span>
                                  </label>
                                );
                              })}
                            </div>
                            {fieldErrors[slotsErrKey] && (
                              <p id={`iv-${ivIdx}-slots-error`} className="field-error">
                                {fieldErrors[slotsErrKey]}
                              </p>
                            )}
                          </fieldset>

                          <div className="custom-slot-row">
                            <div className="custom-slot-input-wrap">
                              <label htmlFor={`iv-${ivIdx}-custom-slot`}>
                                Add custom slot for {iv.name} (HH:MM-HH:MM)
                              </label>
                              <input
                                id={`iv-${ivIdx}-custom-slot`}
                                type="text"
                                value={customSlots[iv.id] || ''}
                                onChange={(e) => {
                                  setCustomSlots((prev) => ({ ...prev, [iv.id]: e.target.value }));
                                  if (customSlotErrors[iv.id]) {
                                    setCustomSlotErrors((prev) => ({ ...prev, [iv.id]: '' }));
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddCustomSlot(ivIdx);
                                  }
                                }}
                                placeholder="e.g. 13:30-13:50"
                                aria-invalid={Boolean(customSlotErrors[iv.id])}
                                aria-describedby={
                                  customSlotErrors[iv.id] ? `iv-${ivIdx}-custom-slot-error` : undefined
                                }
                                disabled={isReadOnly || submitting}
                              />
                              {customSlotErrors[iv.id] && (
                                <p id={`iv-${ivIdx}-custom-slot-error`} className="field-error">
                                  {customSlotErrors[iv.id]}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              className="btn btn-outline custom-slot-btn"
                              onClick={() => handleAddCustomSlot(ivIdx)}
                              disabled={isReadOnly || submitting}
                            >
                              + Add Slot
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <div className="card action-bar-card" aria-label="Interview setup actions">
                <div className="action-bar">
                  <div className="header-actions">
                    <Link to="/executive/campaign" className="btn btn-outline">
                      Back to Campaign Setup
                    </Link>
                    <Link to="/executive/scheduling" className="btn btn-outline">
                      Go to Scheduling
                    </Link>
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isReadOnly || submitting}
                  >
                    {submitting ? 'Saving Interview Setup...' : 'Save Interview Setup'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </>
      )}
    </Layout>
  );
}
