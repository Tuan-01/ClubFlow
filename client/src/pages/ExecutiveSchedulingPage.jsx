import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient, ApiError } from '../api/client';
import { Layout } from '../components/Layout';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAuth } from '../context/AuthContext';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const EMPTY_SUMMARY = {
  totalShortlisted: 0,
  scheduledCount: 0,
  proposedCount: 0,
  unassignedCount: 0,
  conflictCount: 0
};

function formatTime(hhmm) {
  if (!hhmm) return '—';
  return hhmm;
}

function timeRange(start, end) {
  if (!start) return '—';
  return `${formatTime(start)}–${formatTime(end || '')}`;
}

function statusBadgeClass(status) {
  switch (status) {
    case 'proposed':
      return 'badge badge-info';
    case 'conflict':
      return 'badge badge-danger';
    case 'unassigned':
      return 'badge badge-draft';
    case 'confirmed':
      return 'badge badge-success';
    default:
      return 'badge';
  }
}

function statusLabel(status) {
  switch (status) {
    case 'proposed':
      return 'Proposed';
    case 'conflict':
      return 'Conflict';
    case 'unassigned':
      return 'Unassigned';
    case 'confirmed':
      return 'Confirmed';
    default:
      return status || '—';
  }
}

function actionLabel(status) {
  switch (status) {
    case 'conflict':
      return 'Resolve';
    case 'unassigned':
      return '+ Assign Slot';
    default:
      return 'Edit';
  }
}

const ALLOWED_DURATIONS = [15, 20, 30];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidHHMM(value) {
  if (typeof value !== 'string' || !HHMM_RE.test(value)) return false;
  const [h, m] = value.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function validateGenerateParams({ date, windowStart, windowEnd, slotDurationMinutes }) {
  const errors = {};
  if (!isValidIsoDate(date)) {
    errors.date = 'Valid interview date (YYYY-MM-DD) is required.';
  }
  if (!isValidHHMM(windowStart)) {
    errors.windowStart = 'Window start time must be HH:MM.';
  }
  if (!isValidHHMM(windowEnd)) {
    errors.windowEnd = 'Window end time must be HH:MM.';
  } else if (isValidHHMM(windowStart) && toMinutes(windowEnd) <= toMinutes(windowStart)) {
    errors.windowEnd = 'Window end time must be after start time.';
  }
  if (!ALLOWED_DURATIONS.includes(Number(slotDurationMinutes))) {
    errors.slotDurationMinutes = 'Slot duration must be 15, 20, or 30 minutes.';
  }
  return errors;
}

/** Build an array of HH:MM time slot options for a given window + duration. */
function buildSlotOptions(windowStart, windowEnd, durationMinutes) {
  const slots = [];
  if (!isValidHHMM(windowStart) || !isValidHHMM(windowEnd) || !durationMinutes) return slots;
  const toHHMM = (mins) =>
    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  const start = toMinutes(windowStart);
  const end = toMinutes(windowEnd);
  for (let s = start; s + durationMinutes <= end; s += durationMinutes) {
    const eSlot = s + durationMinutes;
    slots.push({ start: toHHMM(s), end: toHHMM(eSlot), label: `${toHHMM(s)}–${toHHMM(eSlot)}` });
  }
  return slots;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function ExecutiveSchedulingPage() {
  const { token } = useAuth();

  /* ---- Data state ---- */
  const [schedule, setSchedule] = useState(null);
  const [setup, setSetup] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);

  /* ---- Generate form state ---- */
  const [genDate, setGenDate] = useState('');
  const [genStart, setGenStart] = useState('09:00');
  const [genEnd, setGenEnd] = useState('12:00');
  const [genDuration, setGenDuration] = useState(20);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genErrors, setGenErrors] = useState({});

  /* ---- Edit drawer state ---- */
  const [editId, setEditId] = useState(null);
  const [editInterviewer, setEditInterviewer] = useState('');
  const [editSlotStart, setEditSlotStart] = useState('');
  const [editSlotEnd, setEditSlotEnd] = useState('');
  const [editRoom, setEditRoom] = useState('');
  const [editPreviewMsg, setEditPreviewMsg] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editFieldErrors, setEditFieldErrors] = useState({});
  const [editError, setEditError] = useState('');

  /* ---- Save / Export / Confirm state ---- */
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  /* ---- Feedback ---- */
  const [actionBanner, setActionBanner] = useState(null);

  const isMutatingRef = useRef(false);
  const drawerRef = useRef(null);
  const dialogRef = useRef(null);

  /* ================================================================ */
  /*  Derived data                                                     */
  /* ================================================================ */
  const summary = schedule?.summary || EMPTY_SUMMARY;
  const assignments = useMemo(
    () => (Array.isArray(schedule?.assignments) ? schedule.assignments : []),
    [schedule]
  );
  const interviewers = useMemo(() => {
    if (Array.isArray(setup?.interviewers)) return setup.interviewers;
    return Array.isArray(schedule?.interviewers) ? schedule.interviewers : [];
  }, [setup, schedule]);

  const rooms = useMemo(() => {
    if (Array.isArray(setup?.rooms)) {
      const selected = Array.isArray(setup?.selectedRoomIds) ? setup.selectedRoomIds : [];
      return selected.length > 0
        ? setup.rooms.filter((r) => selected.includes(r.id))
        : setup.rooms;
    }
    return Array.isArray(schedule?.rooms) ? schedule.rooms : [];
  }, [setup, schedule]);

  const params = schedule?.parameters || {};
  const isReadOnly = Boolean(schedule?.isReadOnly);
  const isConfirmed = schedule?.status === 'confirmed';
  const isDraft = schedule?.status === 'draft';
  const isNotGenerated = !schedule || schedule.status === 'not_generated';
  const noShortlisted = isNotGenerated && (summary.totalShortlisted ?? 0) === 0;

  const issueRows = useMemo(() => {
    return assignments.filter((a) => a.status === 'conflict' || a.status === 'unassigned');
  }, [assignments]);

  const editAssignment = useMemo(() => {
    if (!editId) return null;
    return assignments.find((a) => a.id === editId) || null;
  }, [editId, assignments]);

  const eligibleInterviewers = useMemo(() => {
    if (!editAssignment?.positionId) return interviewers;
    return interviewers.filter(
      (iv) => !Array.isArray(iv.positionIds) || iv.positionIds.includes(editAssignment.positionId)
    );
  }, [interviewers, editAssignment]);

  /* Compute slot options for the drawer based on current schedule parameters */
  const slotOptions = useMemo(() => {
    return buildSlotOptions(params.windowStart, params.windowEnd, params.slotDurationMinutes);
  }, [params.windowStart, params.windowEnd, params.slotDurationMinutes]);

  /* ================================================================ */
  /*  Fetch schedule & interview setup on mount                        */
  /* ================================================================ */
  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError('');

    Promise.all([
      apiClient.get('/api/schedule', { token, signal: controller.signal }),
      apiClient.get('/api/interview-setup', { token, signal: controller.signal })
    ])
      .then(([schedData, setupData]) => {
        const sched = schedData?.schedule || null;
        setSchedule(sched);
        setSetup(setupData?.setup || null);
        if (sched?.parameters) {
          setGenDate(sched.parameters.date || '');
          setGenStart(sched.parameters.windowStart || '09:00');
          setGenEnd(sched.parameters.windowEnd || '12:00');
          setGenDuration(sched.parameters.slotDurationMinutes || 20);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setLoadError(err?.message || 'Unable to load schedule.');
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [token, reloadCount]);

  const handleRetry = useCallback(() => {
    setReloadCount((n) => n + 1);
  }, []);

  /* ================================================================ */
  /*  Apply updated schedule response                                  */
  /* ================================================================ */
  const applyScheduleResponse = useCallback((data) => {
    if (data?.schedule) {
      setSchedule(data.schedule);
      if (data.schedule.parameters) {
        setGenDate(data.schedule.parameters.date || '');
        setGenStart(data.schedule.parameters.windowStart || '09:00');
        setGenEnd(data.schedule.parameters.windowEnd || '12:00');
        setGenDuration(data.schedule.parameters.slotDurationMinutes || 20);
      }
    }
  }, []);

  /* ================================================================ */
  /*  Generate draft                                                   */
  /* ================================================================ */
  const handleGenerate = async () => {
    if (isMutatingRef.current || isReadOnly || noShortlisted) return;

    const clientErrors = validateGenerateParams({
      date: genDate.trim(),
      windowStart: genStart.trim(),
      windowEnd: genEnd.trim(),
      slotDurationMinutes: genDuration
    });
    if (Object.keys(clientErrors).length > 0) {
      setGenErrors(clientErrors);
      setActionBanner({
        type: 'danger',
        title: 'Invalid schedule parameters',
        message: 'Please fix the highlighted scheduling parameters before generating a draft.'
      });
      return;
    }

    isMutatingRef.current = true;
    setIsGenerating(true);
    setGenErrors({});
    setActionBanner(null);

    try {
      const data = await apiClient.post(
        '/api/schedule/generate',
        {
          date: genDate.trim(),
          windowStart: genStart.trim(),
          windowEnd: genEnd.trim(),
          slotDurationMinutes: Number(genDuration)
        },
        { token }
      );
      applyScheduleResponse(data);
      closeDrawer();
      setActionBanner({
        type: 'success',
        title: 'Draft generated',
        message: `Schedule draft created with ${data?.schedule?.summary?.proposedCount ?? 0} proposed, ${data?.schedule?.summary?.conflictCount ?? 0} conflicts, and ${data?.schedule?.summary?.unassignedCount ?? 0} unassigned.`
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.fields && Object.keys(err.fields).length > 0) {
        setGenErrors(err.fields);
        setActionBanner({
          type: 'danger',
          title: 'Invalid schedule parameters',
          message: err.message || 'Please fix the highlighted scheduling parameters.'
        });
      } else if (err instanceof ApiError && err.status === 409) {
        if (err.code === 'SCHEDULE_CONFIRMED') {
          setSchedule((prev) => (prev ? { ...prev, isReadOnly: true, status: 'confirmed' } : prev));
        }
        setActionBanner({ type: 'danger', title: 'Cannot generate', message: err.message });
      } else {
        setActionBanner({
          type: 'danger',
          title: 'Generation failed',
          message: err?.message || 'Unable to generate schedule draft.'
        });
      }
    } finally {
      isMutatingRef.current = false;
      setIsGenerating(false);
    }
  };

  /* ================================================================ */
  /*  Edit drawer                                                      */
  /* ================================================================ */
  const openDrawer = (id) => {
    const a = assignments.find((x) => x.id === id);
    if (!a) return;
    const rowEligible = interviewers.filter(
      (iv) => !Array.isArray(iv.positionIds) || iv.positionIds.includes(a.positionId)
    );
    const defaultInterviewer =
      a.interviewerId && rowEligible.some((iv) => iv.id === a.interviewerId)
        ? a.interviewerId
        : rowEligible[0]?.id || '';
    const defaultRoom =
      a.roomId && rooms.some((r) => r.id === a.roomId)
        ? a.roomId
        : rooms[0]?.id || '';

    setEditId(id);
    setEditInterviewer(defaultInterviewer);
    setEditSlotStart(a.startTime || (slotOptions.length > 0 ? slotOptions[0].start : ''));
    setEditSlotEnd(a.endTime || (slotOptions.length > 0 ? slotOptions[0].end : ''));
    setEditRoom(defaultRoom);
    setEditPreviewMsg(null);
    setEditFieldErrors({});
    setEditError('');
    setActionBanner(null);

    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      window.setTimeout(() => {
        drawerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  const closeDrawer = () => {
    setEditId(null);
    setEditPreviewMsg(null);
    setEditFieldErrors({});
    setEditError('');
  };

  /* When slot selection changes, update paired end time */
  const handleSlotChange = (startVal) => {
    setEditSlotStart(startVal);
    const slot = slotOptions.find((s) => s.start === startVal);
    if (slot) setEditSlotEnd(slot.end);
    if (editFieldErrors.startTime || editFieldErrors.endTime) {
      setEditFieldErrors((prev) => ({ ...prev, startTime: '', endTime: '' }));
    }
  };

  const handleApplyEdit = async () => {
    if (isMutatingRef.current || !editId || isReadOnly) return;
    isMutatingRef.current = true;
    setIsSavingEdit(true);
    setEditFieldErrors({});
    setEditError('');
    setEditPreviewMsg(null);
    setActionBanner(null);

    try {
      const data = await apiClient.patch(
        `/api/schedule/assignments/${encodeURIComponent(editId)}`,
        {
          startTime: editSlotStart,
          endTime: editSlotEnd,
          interviewerId: editInterviewer,
          roomId: editRoom
        },
        { token }
      );
      applyScheduleResponse(data);

      /* Check if the row is still in conflict after the update */
      const updatedRow = data?.schedule?.assignments?.find((a) => a.id === editId);
      if (updatedRow?.status === 'conflict') {
        setEditPreviewMsg({
          type: 'bad',
          text: `Applied, but a conflict remains: ${updatedRow.reason || 'overlap detected.'}`
        });
      } else {
        setEditPreviewMsg({ type: 'ok', text: 'Assignment updated. No overlap detected.' });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.fields && Object.keys(err.fields).length > 0) {
        setEditFieldErrors(err.fields);
        setEditError(err.message || 'Please fix the highlighted assignment fields.');
      } else if (err instanceof ApiError && err.status === 409 && err.code === 'SCHEDULE_CONFIRMED') {
        setSchedule((prev) => (prev ? { ...prev, isReadOnly: true, status: 'confirmed' } : prev));
        setEditError(err.message || 'Schedule is already confirmed and read-only.');
      } else {
        setEditError(err?.message || 'Unable to update assignment.');
      }
    } finally {
      isMutatingRef.current = false;
      setIsSavingEdit(false);
    }
  };

  /* ================================================================ */
  /*  Save Changes                                                     */
  /* ================================================================ */
  const handleSave = async () => {
    if (isMutatingRef.current || isReadOnly) return;
    isMutatingRef.current = true;
    setIsSaving(true);
    setActionBanner(null);

    try {
      const data = await apiClient.put('/api/schedule', { assignments: [] }, { token });
      applyScheduleResponse(data);
      setActionBanner({
        type: 'success',
        title: 'Draft saved',
        message: 'Schedule changes saved. The schedule is not yet confirmed.'
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'SCHEDULE_CONFIRMED') {
        setSchedule((prev) => (prev ? { ...prev, isReadOnly: true, status: 'confirmed' } : prev));
      }
      setActionBanner({
        type: 'danger',
        title: 'Save failed',
        message: err?.message || 'Unable to save draft schedule.'
      });
    } finally {
      isMutatingRef.current = false;
      setIsSaving(false);
    }
  };

  /* ================================================================ */
  /*  Export Timetable                                                  */
  /* ================================================================ */
  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setActionBanner(null);

    try {
      const blob = await apiClient.get('/api/schedule/export', {
        token,
        responseType: 'blob'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'interview-timetable.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setActionBanner({
        type: 'info',
        title: 'Timetable exported',
        message: 'Interview schedule exported to interview-timetable.csv.'
      });
    } catch (err) {
      setActionBanner({
        type: 'danger',
        title: 'Export failed',
        message: err?.message || 'Unable to export timetable.'
      });
    } finally {
      setIsExporting(false);
    }
  };

  /* ================================================================ */
  /*  Approve & Confirm (C9)                                           */
  /* ================================================================ */
  const preConfirmChecks = useMemo(() => {
    const checks = [];
    const unassigned = assignments.filter((a) => a.status === 'unassigned');
    const conflicted = assignments.filter((a) => a.status === 'conflict');

    checks.push({
      ok: isDraft || isConfirmed,
      text: isDraft || isConfirmed ? 'Draft schedule generated' : 'No schedule generated yet'
    });
    checks.push({
      ok: conflicted.length === 0,
      text:
        conflicted.length > 0
          ? `${conflicted.length} conflict${conflicted.length > 1 ? 's' : ''} remain: ${conflicted.map((a) => `${a.applicationId} (${a.applicantName})`).join(', ')}`
          : 'No conflicts remain'
    });
    checks.push({
      ok: unassigned.length === 0,
      text:
        unassigned.length > 0
          ? `${unassigned.length} unassigned: ${unassigned.map((a) => `${a.applicationId} (${a.applicantName})`).join(', ')}`
          : 'Every shortlisted application has an interview'
    });

    return checks;
  }, [assignments, isDraft, isConfirmed]);

  const canConfirm = preConfirmChecks.every((c) => c.ok);

  useEffect(() => {
    if (showConfirmDialog && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal?.();
    }
  }, [showConfirmDialog]);

  const openConfirmDialog = () => {
    setShowConfirmDialog(true);
    setConfirmError('');
  };

  const closeConfirmDialog = () => {
    setShowConfirmDialog(false);
    setConfirmError('');
    dialogRef.current?.close?.();
  };

  const handleConfirm = async () => {
    if (isMutatingRef.current || isReadOnly) return;
    isMutatingRef.current = true;
    setIsConfirming(true);
    setConfirmError('');

    try {
      const data = await apiClient.post('/api/schedule/confirm', {}, { token });
      applyScheduleResponse(data);
      closeConfirmDialog();
      closeDrawer();
      setActionBanner({
        type: 'success',
        title: 'Schedule confirmed',
        message:
          'The interview schedule is now confirmed. Applicants and interviewers can view their assigned interviews. This page is read-only.'
      });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.status === 400)) {
        setConfirmError(err.message);
      } else {
        setConfirmError(err?.message || 'Unable to confirm the schedule.');
      }
    } finally {
      isMutatingRef.current = false;
      setIsConfirming(false);
    }
  };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
    <Layout title="Interview Scheduling" topbarLabel="Executive · Steps C8–C9">
      <div className="page-header">
        <div className="page-header-top">
          <div>
            <h1>Interview Scheduling</h1>
            <p className="page-subtitle">
              {isConfirmed
                ? 'Schedule confirmed — this page is read-only.'
                : 'Generate draft interview timetables, resolve conflicts, and confirm the schedule.'}
            </p>
          </div>
          <div className="header-actions">
            <span className={isConfirmed ? 'badge badge-success' : 'badge badge-draft'}>
              {isConfirmed ? 'Confirmed' : isDraft ? 'Draft' : 'Not Generated'}
            </span>
          </div>
        </div>
      </div>

      {/* ---- Loading / Error / Empty gates ---- */}
      {isLoading && (
        <LoadingState
          title="Loading schedule"
          message="Fetching interview scheduling data..."
        />
      )}

      {!isLoading && loadError && (
        <ErrorState
          title="Unable to load schedule"
          message={loadError}
          onRetry={handleRetry}
        />
      )}

      {!isLoading && !loadError && !schedule && (
        <EmptyState
          title="No schedule available"
          message="No scheduling data is available for this campaign. Generate a draft schedule to get started."
        />
      )}

      {!isLoading && !loadError && schedule && (
        <>
          {/* ---- Confirmed banner ---- */}
          {isConfirmed && (
            <div
              className="alert alert-success"
              role="status"
              aria-label="Schedule confirmed"
            >
              <div className="alert-content">
                <div className="alert-title">Schedule Confirmed</div>
                <p style={{ marginBottom: 0 }}>
                  Applicants and interviewers can now see their own interviews, and this page is
                  read-only. No further editing, regeneration, or saving is possible.
                </p>
              </div>
            </div>
          )}

          {/* ---- Action banner ---- */}
          {actionBanner && (
            <div
              className={`alert alert-${actionBanner.type}`}
              role={actionBanner.type === 'danger' ? 'alert' : 'status'}
            >
              <div className="alert-content">
                <div className="alert-title">{actionBanner.title}</div>
                <p style={{ marginBottom: 0 }}>{actionBanner.message}</p>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setActionBanner(null)}
                aria-label="Dismiss notification"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ---- Parameters Card ---- */}
          <section className="card" aria-labelledby="sched-params-heading">
            <h2 id="sched-params-heading">Scheduling Parameters</h2>
            <div className="form-grid-3" style={{ marginBottom: 'var(--space-4)' }}>
              <div className="form-group">
                <label htmlFor="sched-date">Interview date</label>
                <input
                  id="sched-date"
                  type="date"
                  value={genDate}
                  onChange={(e) => {
                    setGenDate(e.target.value);
                    if (genErrors.date) {
                      setGenErrors((prev) => ({ ...prev, date: '' }));
                    }
                  }}
                  disabled={isReadOnly}
                  aria-invalid={Boolean(genErrors.date)}
                  aria-describedby={genErrors.date ? 'sched-date-err' : undefined}
                />
                {genErrors.date && (
                  <p id="sched-date-err" className="field-error" role="alert">
                    {genErrors.date}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="sched-ws">Window starts</label>
                <input
                  id="sched-ws"
                  type="time"
                  value={genStart}
                  onChange={(e) => {
                    setGenStart(e.target.value);
                    if (genErrors.windowStart || genErrors.windowEnd) {
                      setGenErrors((prev) => ({ ...prev, windowStart: '', windowEnd: '' }));
                    }
                  }}
                  disabled={isReadOnly}
                  aria-invalid={Boolean(genErrors.windowStart)}
                  aria-describedby={genErrors.windowStart ? 'sched-ws-err' : undefined}
                />
                {genErrors.windowStart && (
                  <p id="sched-ws-err" className="field-error" role="alert">
                    {genErrors.windowStart}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="sched-we">Window ends</label>
                <input
                  id="sched-we"
                  type="time"
                  value={genEnd}
                  onChange={(e) => {
                    setGenEnd(e.target.value);
                    if (genErrors.windowEnd) {
                      setGenErrors((prev) => ({ ...prev, windowEnd: '' }));
                    }
                  }}
                  disabled={isReadOnly}
                  aria-invalid={Boolean(genErrors.windowEnd)}
                  aria-describedby={genErrors.windowEnd ? 'sched-we-err' : undefined}
                />
                {genErrors.windowEnd && (
                  <p id="sched-we-err" className="field-error" role="alert">
                    {genErrors.windowEnd}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="sched-dur">Slot length</label>
                <select
                  id="sched-dur"
                  value={String(genDuration)}
                  onChange={(e) => {
                    setGenDuration(Number(e.target.value));
                    if (genErrors.slotDurationMinutes) {
                      setGenErrors((prev) => ({ ...prev, slotDurationMinutes: '' }));
                    }
                  }}
                  disabled={isReadOnly}
                  aria-invalid={Boolean(genErrors.slotDurationMinutes)}
                  aria-describedby={
                    genErrors.slotDurationMinutes ? 'sched-dur-err' : undefined
                  }
                >
                  <option value="15">15 minutes</option>
                  <option value="20">20 minutes</option>
                  <option value="30">30 minutes</option>
                </select>
                {genErrors.slotDurationMinutes && (
                  <p id="sched-dur-err" className="field-error" role="alert">
                    {genErrors.slotDurationMinutes}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={isReadOnly || isGenerating || noShortlisted}
              aria-describedby={noShortlisted ? 'sched-no-shortlisted-hint' : undefined}
            >
              {isGenerating
                ? 'Generating...'
                : isDraft
                  ? 'Regenerate Draft'
                  : 'Generate Draft'}
            </button>
            {noShortlisted && (
              <p id="sched-no-shortlisted-hint" className="form-hint">
                Shortlist at least 1 application in Application Review before generating a schedule.
              </p>
            )}
          </section>

          {/* ---- Summary Stats (from API) ---- */}
          <div className="stats-grid" aria-label="Schedule summary">
            <div className="stat-card">
              <div className="stat-value">{summary.totalShortlisted}</div>
              <div className="stat-label">Shortlisted</div>
            </div>
            <div className="stat-card stat-success">
              <div className="stat-value">{summary.proposedCount}</div>
              <div className="stat-label">
                {isConfirmed ? 'Confirmed' : 'Proposed'}
              </div>
            </div>
            <div className="stat-card stat-danger">
              <div className="stat-value">{summary.conflictCount}</div>
              <div className="stat-label">Conflict</div>
            </div>
            <div className="stat-card stat-warning">
              <div className="stat-value">{summary.unassignedCount}</div>
              <div className="stat-label">Unassigned</div>
            </div>
          </div>

          {/* ---- Issues / Needs Attention ---- */}
          {issueRows.length > 0 && (
            <section className="card" aria-labelledby="sched-issues-heading">
              <h2 id="sched-issues-heading">
                Needs Attention ({issueRows.length})
              </h2>
              {issueRows.map((a) => (
                <div key={a.id} className="sched-issue-row">
                  <div className="sched-issue-content">
                    <span className={statusBadgeClass(a.status)}>
                      {statusLabel(a.status)}
                    </span>
                    <p className="sched-issue-text">
                      <strong>{a.applicantName}</strong> ({a.applicationId},{' '}
                      {a.positionTitle}
                      {a.startTime ? `, ${timeRange(a.startTime, a.endTime)}` : ''}
                      ): {a.reason || 'No assigned slot.'}
                    </p>
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => openDrawer(a.id)}
                    >
                      {a.status === 'conflict' ? 'Resolve' : '+ Assign Slot'}
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* ---- Main Table + Edit Drawer Layout ---- */}
          <div className={`sched-layout${editId ? ' drawer-open' : ''}`}>
            {/* Table */}
            <section aria-labelledby="sched-table-heading">
              <div className="sched-table-header">
                <h2 id="sched-table-heading">Interview Schedule</h2>
                <div className="header-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleExport}
                    disabled={isExporting || isNotGenerated}
                  >
                    {isExporting ? 'Exporting...' : 'Export Timetable'}
                  </button>
                  {!isReadOnly && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={handleSave}
                      disabled={isSaving || isNotGenerated}
                    >
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={openConfirmDialog}
                    disabled={isReadOnly || isNotGenerated || assignments.length === 0}
                  >
                    {isConfirmed ? 'Confirmed' : 'Approve & Confirm Schedule'}
                  </button>
                </div>
              </div>

              {assignments.length === 0 ? (
                <div className="state-box state-empty">
                  <p className="state-title">
                    {noShortlisted ? 'No shortlisted candidates yet' : 'No scheduled interviews'}
                  </p>
                  <p className="state-message">
                    {noShortlisted
                      ? 'There are currently 0 shortlisted applications to schedule. Shortlist candidates in Application Review first.'
                      : isNotGenerated
                        ? 'Set the scheduling parameters above and generate a draft to begin.'
                        : 'No shortlisted applications to schedule. Review applications first.'}
                  </p>
                  {isNotGenerated && (
                    <div className="state-actions">
                      <Link to="/executive/applications" className="btn btn-outline">
                        Review Applications
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table className="data-table" aria-label="Interview schedule">
                      <thead>
                        <tr>
                          <th scope="col">Applicant</th>
                          <th scope="col">Position</th>
                          <th scope="col">Time</th>
                          <th scope="col">Interviewer</th>
                          <th scope="col">Room</th>
                          <th scope="col">Status</th>
                          {!isReadOnly && <th scope="col"><span className="sr-only">Actions</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {assignments.map((a) => (
                          <tr
                            key={a.id}
                            className={
                              (a.status === 'conflict' ? 'row-conflict' : '') +
                              (editId === a.id ? ' row-selected' : '')
                            }
                          >
                            <td>
                              <strong>{a.applicantName}</strong>
                              <br />
                              <span className="text-muted" style={{ fontSize: '0.8125rem' }}>
                                {a.studentId} · {a.applicationId}
                              </span>
                            </td>
                            <td>{a.positionTitle}</td>
                            <td>{a.startTime ? timeRange(a.startTime, a.endTime) : '—'}</td>
                            <td>
                              {a.interviewerName || '—'}
                              {a.status === 'conflict' && a.interviewerName && (
                                <span aria-hidden="true"> ⚠️</span>
                              )}
                            </td>
                            <td>{a.roomName || '—'}</td>
                            <td>
                              <span className={statusBadgeClass(a.status)}>
                                {statusLabel(a.status)}
                              </span>
                            </td>
                            {!isReadOnly && (
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => openDrawer(a.id)}
                                >
                                  {actionLabel(a.status)}
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="sched-table-footer">
                    <span className="text-muted">
                      Showing {assignments.length} shortlisted application
                      {assignments.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-muted">
                      {summary.conflictCount > 0
                        ? `${summary.conflictCount} conflict${summary.conflictCount > 1 ? 's' : ''} remaining`
                        : summary.unassignedCount > 0
                          ? `${summary.unassignedCount} unassigned`
                          : isConfirmed
                            ? 'Schedule is confirmed.'
                            : 'Ready to confirm.'}
                    </span>
                  </div>
                </>
              )}
            </section>

            {/* ---- Edit / Resolve / Assign Drawer ---- */}
            {editId && editAssignment && !isReadOnly && (
              <aside
                ref={drawerRef}
                className="drawer-panel"
                aria-labelledby="sched-drawer-heading"
              >
                <div className="drawer-header">
                  <div className="drawer-header-text">
                    <h2 id="sched-drawer-heading">
                      {editAssignment.status === 'unassigned'
                        ? 'Assign Slot'
                        : editAssignment.status === 'conflict'
                          ? 'Resolve Conflict'
                          : 'Edit Assignment'}
                    </h2>
                    <p className="text-muted" style={{ marginBottom: 0 }}>
                      {editAssignment.applicantName} · {editAssignment.positionTitle} (
                      {editAssignment.applicationId})
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline drawer-close-btn"
                    onClick={closeDrawer}
                    aria-label="Close assignment editor"
                  >
                    Close
                  </button>
                </div>

                <div className="drawer-section">
                  <div className="form-group">
                    <label htmlFor="edit-interviewer">Interviewer</label>
                    <select
                      id="edit-interviewer"
                      value={editInterviewer}
                      onChange={(e) => {
                        setEditInterviewer(e.target.value);
                        if (editFieldErrors.interviewerId) {
                          setEditFieldErrors((prev) => ({ ...prev, interviewerId: '' }));
                        }
                      }}
                      disabled={isSavingEdit || eligibleInterviewers.length === 0}
                      aria-invalid={Boolean(editFieldErrors.interviewerId)}
                      aria-describedby={
                        editFieldErrors.interviewerId ? 'edit-interviewer-err' : undefined
                      }
                    >
                      {eligibleInterviewers.length === 0 ? (
                        <option value="">No eligible interviewers configured</option>
                      ) : (
                        eligibleInterviewers.map((iv) => (
                          <option key={iv.id} value={iv.id}>
                            {iv.name}
                          </option>
                        ))
                      )}
                    </select>
                    {editFieldErrors.interviewerId && (
                      <p id="edit-interviewer-err" className="field-error" role="alert">
                        {editFieldErrors.interviewerId}
                      </p>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="edit-slot">Time slot</label>
                    <select
                      id="edit-slot"
                      value={editSlotStart}
                      onChange={(e) => handleSlotChange(e.target.value)}
                      disabled={isSavingEdit}
                      aria-invalid={Boolean(editFieldErrors.startTime || editFieldErrors.endTime)}
                      aria-describedby={
                        editFieldErrors.startTime || editFieldErrors.endTime
                          ? 'edit-slot-err'
                          : undefined
                      }
                    >
                      {slotOptions.map((s) => (
                        <option key={s.start} value={s.start}>
                          {s.label}
                        </option>
                      ))}
                      {/* If current assignment time is outside generated slots, still show it */}
                      {editAssignment.startTime &&
                        !slotOptions.find((s) => s.start === editAssignment.startTime) && (
                          <option value={editAssignment.startTime}>
                            {timeRange(editAssignment.startTime, editAssignment.endTime)} (current)
                          </option>
                        )}
                    </select>
                    {(editFieldErrors.startTime || editFieldErrors.endTime) && (
                      <p id="edit-slot-err" className="field-error" role="alert">
                        {editFieldErrors.startTime || editFieldErrors.endTime}
                      </p>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="edit-room">Room</label>
                    <select
                      id="edit-room"
                      value={editRoom}
                      onChange={(e) => {
                        setEditRoom(e.target.value);
                        if (editFieldErrors.roomId) {
                          setEditFieldErrors((prev) => ({ ...prev, roomId: '' }));
                        }
                      }}
                      disabled={isSavingEdit || rooms.length === 0}
                      aria-invalid={Boolean(editFieldErrors.roomId)}
                      aria-describedby={editFieldErrors.roomId ? 'edit-room-err' : undefined}
                    >
                      {rooms.length === 0 ? (
                        <option value="">No rooms selected in setup</option>
                      ) : (
                        rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))
                      )}
                    </select>
                    {editFieldErrors.roomId && (
                      <p id="edit-room-err" className="field-error" role="alert">
                        {editFieldErrors.roomId}
                      </p>
                    )}
                  </div>
                </div>

                {/* Preview message */}
                {editPreviewMsg && (
                  <div
                    className={`alert ${editPreviewMsg.type === 'ok' ? 'alert-success' : 'alert-danger'}`}
                    role="status"
                    style={{ marginBottom: 'var(--space-3)' }}
                  >
                    <div className="alert-content">
                      <p style={{ marginBottom: 0 }}>{editPreviewMsg.text}</p>
                    </div>
                  </div>
                )}

                {editError && (
                  <div className="alert alert-danger" role="alert" style={{ marginBottom: 'var(--space-3)' }}>
                    <div className="alert-content">
                      <p style={{ marginBottom: 0 }}>{editError}</p>
                    </div>
                  </div>
                )}

                <div className="drawer-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={closeDrawer}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleApplyEdit}
                    disabled={isSavingEdit}
                  >
                    {isSavingEdit ? 'Applying...' : 'Apply Change'}
                  </button>
                </div>
              </aside>
            )}
          </div>

          {/* ---- Confirm Dialog (C9) ---- */}
          {showConfirmDialog && (
            <dialog
              ref={dialogRef}
              className="sched-confirm-dialog"
              aria-labelledby="confirm-dialog-title"
              onCancel={(e) => {
                e.preventDefault();
                closeConfirmDialog();
              }}
            >
              <h2 id="confirm-dialog-title">Approve and confirm schedule?</h2>
              <p className="text-muted">
                After confirming, the campaign and schedule become read-only.
              </p>

              <div className="sched-checks-list">
                {preConfirmChecks.map((check, i) => (
                  <div key={i} className="sched-check-item">
                    <span
                      className={`sched-check-icon ${check.ok ? 'check-pass' : 'check-fail'}`}
                      aria-hidden="true"
                    >
                      {check.ok ? '✓' : '!'}
                    </span>
                    <span>{check.text}</span>
                  </div>
                ))}
              </div>

              {confirmError && (
                <div className="alert alert-danger" role="alert" style={{ marginTop: 'var(--space-3)' }}>
                  <div className="alert-content">
                    <p style={{ marginBottom: 0 }}>{confirmError}</p>
                    <Link to="/executive/applications" className="inline-action-link">
                      Go to Application Review
                    </Link>
                  </div>
                </div>
              )}

              <div className="sched-dialog-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={closeConfirmDialog}
                >
                  Back to Schedule
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirm}
                  disabled={!canConfirm || isConfirming}
                >
                  {isConfirming ? 'Confirming...' : 'Confirm Schedule'}
                </button>
              </div>
            </dialog>
          )}
        </>
      )}
    </Layout>
  );
}
