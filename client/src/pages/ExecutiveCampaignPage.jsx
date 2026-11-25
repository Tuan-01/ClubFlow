import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient, ApiError } from '../api/client';
import { Layout } from '../components/Layout';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAuth } from '../context/AuthContext';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function createPositionRow(overrides = {}) {
  const key =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `pos-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    _key: key,
    id: overrides.id || '',
    department: overrides.department ?? '',
    title: overrides.title ?? '',
    quota: overrides.quota !== undefined && overrides.quota !== null ? String(overrides.quota) : '1',
    description: overrides.description ?? '',
    requirements: overrides.requirements ?? ''
  };
}

function campaignToFormState(campaign) {
  return {
    name: campaign?.name || '',
    clubName: campaign?.clubName || '',
    description: campaign?.description || '',
    openingDate: campaign?.openingDate || '',
    closingDate: campaign?.closingDate || '',
    interviewDate: campaign?.interviewDate || '',
    instructions: campaign?.instructions || '',
    positions: Array.isArray(campaign?.positions)
      ? campaign.positions.map((pos) => createPositionRow(pos))
      : []
  };
}

function validatePublishForm(form) {
  const errors = {};
  const name = form.name.trim();
  const clubName = form.clubName.trim();
  const description = form.description.trim();
  const openingDate = form.openingDate.trim();
  const closingDate = form.closingDate.trim();
  const interviewDate = form.interviewDate.trim();
  const instructions = form.instructions.trim();

  if (!name || name.length > 120) {
    errors.name = 'Campaign name is required (1–120 characters).';
  }
  if (!clubName || clubName.length > 120) {
    errors.clubName = 'Host club name is required (1–120 characters).';
  }
  if (!description || description.length > 1000) {
    errors.description = 'Campaign description is required (1–1000 characters).';
  }

  if (!isValidIsoDate(openingDate)) {
    errors.openingDate = 'Valid opening date (YYYY-MM-DD) is required.';
  }
  if (!isValidIsoDate(closingDate)) {
    errors.closingDate = 'Valid closing date (YYYY-MM-DD) is required.';
  } else if (isValidIsoDate(openingDate) && closingDate <= openingDate) {
    errors.closingDate = 'Closing date must be after opening date.';
  }

  if (!isValidIsoDate(interviewDate)) {
    errors.interviewDate = 'Valid interview date (YYYY-MM-DD) is required.';
  } else if (
    (isValidIsoDate(closingDate) && interviewDate <= closingDate) ||
    (isValidIsoDate(openingDate) && interviewDate <= openingDate)
  ) {
    errors.interviewDate = 'Interview date must be after closing date.';
  }

  if (!instructions || instructions.length > 1000) {
    errors.instructions = 'Instructions are required (1–1000 characters).';
  }

  if (!Array.isArray(form.positions) || form.positions.length === 0) {
    errors.positions = 'Add at least one department and position before publishing.';
  } else {
    form.positions.forEach((pos, idx) => {
      const dept = pos.department.trim();
      const title = pos.title.trim();
      const desc = pos.description.trim();
      const reqs = pos.requirements.trim();
      const quotaText = String(pos.quota).trim();
      const quotaNum = Number(quotaText);

      if (!dept || dept.length > 80) {
        errors[`positions[${idx}].department`] = 'Department is required (1–80 characters).';
      }
      if (!title || title.length > 100) {
        errors[`positions[${idx}].title`] = 'Position title is required (1–100 characters).';
      }
      if (!quotaText || !Number.isInteger(quotaNum) || quotaNum < 1 || quotaNum > 50) {
        errors[`positions[${idx}].quota`] = 'Vacancy quota must be a whole number between 1 and 50.';
      }
      if (!desc || desc.length > 500) {
        errors[`positions[${idx}].description`] = 'Description is required (1–500 characters).';
      }
      if (!reqs || reqs.length > 500) {
        errors[`positions[${idx}].requirements`] = 'Requirements are required (1–500 characters).';
      }
    });
  }

  return errors;
}

function validateDraftForm(form) {
  const errors = {};
  if (form.name.length > 120) {
    errors.name = 'Campaign name must not exceed 120 characters.';
  }
  if (form.clubName.length > 120) {
    errors.clubName = 'Host club name must not exceed 120 characters.';
  }
  if (form.description.length > 1000) {
    errors.description = 'Campaign description must not exceed 1000 characters.';
  }
  if (form.openingDate && !isValidIsoDate(form.openingDate.trim())) {
    errors.openingDate = 'Opening date must use YYYY-MM-DD format.';
  }
  if (form.closingDate && !isValidIsoDate(form.closingDate.trim())) {
    errors.closingDate = 'Closing date must use YYYY-MM-DD format.';
  }
  if (form.interviewDate && !isValidIsoDate(form.interviewDate.trim())) {
    errors.interviewDate = 'Interview date must use YYYY-MM-DD format.';
  }
  if (form.instructions.length > 1000) {
    errors.instructions = 'Instructions must not exceed 1000 characters.';
  }

  form.positions.forEach((pos, idx) => {
    if (pos.department.length > 80) {
      errors[`positions[${idx}].department`] = 'Department must not exceed 80 characters.';
    }
    if (pos.title.length > 100) {
      errors[`positions[${idx}].title`] = 'Position title must not exceed 100 characters.';
    }
    const quotaText = String(pos.quota).trim();
    if (quotaText !== '') {
      const quotaNum = Number(quotaText);
      if (Number.isNaN(quotaNum) || !Number.isInteger(quotaNum) || quotaNum < 1 || quotaNum > 50) {
        errors[`positions[${idx}].quota`] = 'Vacancy quota must be a whole number between 1 and 50.';
      }
    }
    if (pos.description.length > 500) {
      errors[`positions[${idx}].description`] = 'Description must not exceed 500 characters.';
    }
    if (pos.requirements.length > 500) {
      errors[`positions[${idx}].requirements`] = 'Requirements must not exceed 500 characters.';
    }
  });

  return errors;
}

function buildPayload(form, { isDraft }) {
  return {
    name: isDraft ? form.name : form.name.trim(),
    clubName: isDraft ? form.clubName : form.clubName.trim(),
    description: isDraft ? form.description : form.description.trim(),
    openingDate: form.openingDate.trim(),
    closingDate: form.closingDate.trim(),
    interviewDate: form.interviewDate.trim(),
    instructions: isDraft ? form.instructions : form.instructions.trim(),
    positions: form.positions.map((pos) => {
      const quotaText = String(pos.quota).trim();
      const parsedQuota = quotaText === '' ? (isDraft ? undefined : NaN) : Number(quotaText);
      const item = {
        department: isDraft ? pos.department : pos.department.trim(),
        title: isDraft ? pos.title : pos.title.trim(),
        description: isDraft ? pos.description : pos.description.trim(),
        requirements: isDraft ? pos.requirements : pos.requirements.trim()
      };
      if (pos.id) {
        item.id = pos.id;
      }
      if (parsedQuota !== undefined) {
        item.quota = parsedQuota;
      }
      return item;
    })
  };
}

function getStatusBadge(campaign) {
  if (!campaign) return { className: 'badge badge-draft', label: 'Draft' };
  if (campaign.isReadOnly || campaign.status === 'confirmed') {
    return { className: 'badge badge-warning', label: 'Confirmed · Read-Only' };
  }
  if (campaign.status === 'published') {
    return { className: 'badge badge-success', label: 'Published' };
  }
  if (campaign.status === 'closed') {
    return { className: 'badge badge-info', label: 'Applications Closed' };
  }
  return { className: 'badge badge-draft', label: 'Draft' };
}

function formatTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString();
}

export function ExecutiveCampaignPage() {
  const { token } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [form, setForm] = useState(() => campaignToFormState(null));
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);

  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formBanner, setFormBanner] = useState(null);
  const [submittingAction, setSubmittingAction] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const isSubmittingRef = useRef(false);
  const fieldRefs = useRef({});
  const previewRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadError('');

    apiClient
      .get('/api/campaign', { token, signal: controller.signal })
      .then((data) => {
        const loaded = data?.campaign || null;
        setCampaign(loaded);
        setForm(campaignToFormState(loaded));
        setFieldErrors({});
        setFormBanner(null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') return;
        setLoadError(err?.message || 'Unable to load campaign configuration.');
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [token, reloadCount]);

  const handleRetry = useCallback(() => {
    setReloadCount((n) => n + 1);
  }, []);

  const isReadOnly = Boolean(campaign?.isReadOnly || campaign?.status === 'confirmed');
  const isBusy = submittingAction !== null;

  const departmentSuggestions = useMemo(() => {
    const seen = new Set();
    form.positions.forEach((p) => {
      const dept = p.department.trim();
      if (dept) seen.add(dept);
    });
    return [...seen];
  }, [form.positions]);

  const totalVacancies = useMemo(() => {
    return form.positions.reduce((sum, p) => {
      const q = Number(p.quota);
      return sum + (Number.isInteger(q) && q > 0 ? q : 0);
    }, 0);
  }, [form.positions]);

  const previewDepartments = useMemo(() => {
    const groups = new Map();
    form.positions.forEach((pos, idx) => {
      const deptName = pos.department.trim() || 'Unassigned Department';
      if (!groups.has(deptName)) {
        groups.set(deptName, []);
      }
      groups.get(deptName).push({ ...pos, index: idx });
    });
    return [...groups.entries()];
  }, [form.positions]);

  const registerFieldRef = (key) => (el) => {
    if (el) {
      fieldRefs.current[key] = el;
    } else {
      delete fieldRefs.current[key];
    }
  };

  const focusFirstInvalidField = (errors) => {
    const firstKey = Object.keys(errors)[0];
    if (firstKey && fieldRefs.current[firstKey]) {
      fieldRefs.current[firstKey].focus();
    }
  };

  const updateField = (name, value) => {
    const nextForm = { ...form, [name]: value };
    setForm(nextForm);
    setFormBanner(null);
    if (hasAttemptedSubmit) {
      const nextErrors = validatePublishForm(nextForm);
      setFieldErrors(nextErrors);
    } else if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    }
  };

  const updatePositionField = (idx, fieldName, value) => {
    const nextPositions = form.positions.map((pos, i) =>
      i === idx ? { ...pos, [fieldName]: value } : pos
    );
    const nextForm = { ...form, positions: nextPositions };
    setForm(nextForm);
    setFormBanner(null);
    const errorKey = `positions[${idx}].${fieldName}`;
    if (hasAttemptedSubmit) {
      const nextErrors = validatePublishForm(nextForm);
      setFieldErrors(nextErrors);
    } else if (fieldErrors[errorKey]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[errorKey];
        return copy;
      });
    }
  };

  const handleAddPosition = (presetDepartment = '') => {
    if (isReadOnly || isBusy) return;
    const nextPositions = [
      ...form.positions,
      createPositionRow({ department: presetDepartment, quota: '1' })
    ];
    const nextForm = { ...form, positions: nextPositions };
    setForm(nextForm);
    setFormBanner(null);
    if (hasAttemptedSubmit) {
      setFieldErrors(validatePublishForm(nextForm));
    } else if (fieldErrors.positions) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy.positions;
        return copy;
      });
    }
  };

  const handleRemovePosition = (idx) => {
    if (isReadOnly || isBusy) return;
    const nextPositions = form.positions.filter((_, i) => i !== idx);
    const nextForm = { ...form, positions: nextPositions };
    setForm(nextForm);
    setFormBanner(null);
    if (hasAttemptedSubmit) {
      setFieldErrors(validatePublishForm(nextForm));
    } else {
      setFieldErrors({});
    }
  };

  const syncSavedCampaign = (savedCampaign) => {
    setCampaign(savedCampaign);
    setForm((prevForm) => {
      const savedPositions = Array.isArray(savedCampaign?.positions) ? savedCampaign.positions : [];
      return {
        name: savedCampaign?.name ?? prevForm.name,
        clubName: savedCampaign?.clubName ?? prevForm.clubName,
        description: savedCampaign?.description ?? prevForm.description,
        openingDate: savedCampaign?.openingDate ?? prevForm.openingDate,
        closingDate: savedCampaign?.closingDate ?? prevForm.closingDate,
        interviewDate: savedCampaign?.interviewDate ?? prevForm.interviewDate,
        instructions: savedCampaign?.instructions ?? prevForm.instructions,
        positions: savedPositions.map((pos, idx) => ({
          _key: prevForm.positions[idx]?._key || createPositionRow(pos)._key,
          id: pos.id || '',
          department: pos.department ?? '',
          title: pos.title ?? '',
          quota: pos.quota !== undefined && pos.quota !== null ? String(pos.quota) : '1',
          description: pos.description ?? '',
          requirements: pos.requirements ?? ''
        }))
      };
    });
  };

  const handleApiMutationError = (err) => {
    if (err instanceof ApiError && err.status === 409 && err.code === 'SCHEDULE_CONFIRMED') {
      setCampaign((prev) => (prev ? { ...prev, isReadOnly: true, status: 'confirmed' } : prev));
      setFormBanner({
        type: 'warning',
        title: 'Campaign locked (Read-Only)',
        message: err.message || 'The interview schedule is confirmed, so the campaign can no longer be edited.'
      });
      return;
    }

    if (err instanceof ApiError && err.status === 400 && err.fields && Object.keys(err.fields).length > 0) {
      setFieldErrors(err.fields);
      setFormBanner({
        type: 'danger',
        title: 'Please review the highlighted fields',
        message: err.message || 'Some campaign fields need attention.'
      });
      focusFirstInvalidField(err.fields);
      return;
    }

    setFormBanner({
      type: 'danger',
      title: 'Request failed',
      message: err?.message || 'Unable to save campaign changes. Your entered values have been kept.'
    });
  };

  const handleSaveDraft = async () => {
    if (isReadOnly || isSubmittingRef.current) return;
    setFormBanner(null);

    const draftErrors = validateDraftForm(form);
    if (Object.keys(draftErrors).length > 0) {
      setFieldErrors(draftErrors);
      setFormBanner({
        type: 'danger',
        title: 'Cannot save draft',
        message: 'Fix the highlighted fields before saving your draft.'
      });
      focusFirstInvalidField(draftErrors);
      return;
    }

    isSubmittingRef.current = true;
    setSubmittingAction('draft');
    setFieldErrors({});

    try {
      const payload = buildPayload(form, { isDraft: true });
      const data = await apiClient.put('/api/campaign/draft', payload, { token });
      syncSavedCampaign(data.campaign);
      setHasAttemptedSubmit(false);
      setFormBanner({
        type: 'success',
        title: 'Draft saved',
        message: `Campaign draft saved at ${formatTimestamp(data.campaign?.draftSavedAt)}.`
      });
    } catch (err) {
      handleApiMutationError(err);
    } finally {
      isSubmittingRef.current = false;
      setSubmittingAction(null);
    }
  };

  const handlePublish = async (e) => {
    e.preventDefault();
    if (isReadOnly || isSubmittingRef.current) return;

    setHasAttemptedSubmit(true);
    setFormBanner(null);

    const clientErrors = validatePublishForm(form);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setFormBanner({
        type: 'danger',
        title: 'Cannot publish campaign',
        message: 'Please correct the highlighted fields below before publishing.'
      });
      focusFirstInvalidField(clientErrors);
      return;
    }

    isSubmittingRef.current = true;
    setSubmittingAction('publish');
    setFieldErrors({});

    try {
      const payload = buildPayload(form, { isDraft: false });
      const data = await apiClient.post('/api/campaign/publish', payload, { token });
      syncSavedCampaign(data.campaign);
      setHasAttemptedSubmit(false);
      setFormBanner({
        type: 'success',
        title: 'Campaign published',
        message: `Campaign is live (${formatTimestamp(data.campaign?.publishedAt)}). Proceed to Interview Setup when ready.`
      });
    } catch (err) {
      handleApiMutationError(err);
    } finally {
      isSubmittingRef.current = false;
      setSubmittingAction(null);
    }
  };

  const handleTogglePreview = () => {
    setShowPreview((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
      return next;
    });
  };

  const statusBadge = getStatusBadge(campaign);
  const draftMs = campaign?.draftSavedAt ? Date.parse(campaign.draftSavedAt) : NaN;
  const publishedMs = campaign?.publishedAt ? Date.parse(campaign.publishedAt) : NaN;
  const showPublishedCard =
    Boolean(campaign?.publishedAt) &&
    (Number.isNaN(draftMs) || (!Number.isNaN(publishedMs) && publishedMs >= draftMs));

  return (
    <Layout title="Campaign Setup" topbarLabel="Executive · Step C3">
      <div className="page-header">
        <div className="page-header-top">
          <div>
            <h1>Recruitment Campaign Setup</h1>
            <p className="page-subtitle">
              Configure campaign details, application timeline, departments, positions, and applicant instructions.
            </p>
          </div>
          {!isLoading && !loadError && (
            <span className={statusBadge.className}>{statusBadge.label}</span>
          )}
        </div>
      </div>

      {isLoading && (
        <LoadingState
          title="Loading campaign configuration"
          message="Fetching your club recruitment campaign details and positions..."
        />
      )}

      {!isLoading && loadError && (
        <ErrorState
          title="Unable to load campaign"
          message={loadError}
          onRetry={handleRetry}
        />
      )}

      {!isLoading && !loadError && campaign && (
        <>
          {isReadOnly && (
            <section className="alert alert-warning" role="status" aria-label="Read-only schedule lock">
              <div className="alert-content">
                <div className="alert-title">Campaign Locked (Schedule Confirmed)</div>
                <p style={{ marginBottom: 0 }}>
                  The interview schedule has been confirmed in Step C9. Campaign details, dates, and positions are now read-only.
                </p>
              </div>
              <Link to="/executive/scheduling" className="btn btn-outline">
                View Confirmed Schedule
              </Link>
            </section>
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
                <div className="header-actions">
                  <Link to="/executive/interview-setup" className="btn btn-outline">
                    Go to Interview Setup
                  </Link>
                  <Link to="/" className="btn btn-outline">
                    View Public Campaign
                  </Link>
                </div>
              )}
            </div>
          )}

          <div className="stats-grid" aria-label="Campaign summary counts">
            <div className="stat-card">
              <div className="stat-value">{departmentSuggestions.length}</div>
              <div className="stat-label">Departments</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{form.positions.length}</div>
              <div className="stat-label">Positions</div>
            </div>
            <div className="stat-card stat-success">
              <div className="stat-value">{totalVacancies}</div>
              <div className="stat-label">Total Vacancies</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {showPublishedCard ? 'Published' : campaign.draftSavedAt ? 'Saved' : 'New'}
              </div>
              <div className="stat-label">
                {showPublishedCard
                  ? `Published: ${formatTimestamp(campaign.publishedAt)}`
                  : campaign.draftSavedAt
                    ? `Draft: ${formatTimestamp(campaign.draftSavedAt)}`
                    : 'Not saved yet'}
              </div>
            </div>
          </div>

          <form onSubmit={handlePublish} noValidate>
            <section className="card" aria-labelledby="campaign-basic-heading">
              <h2 id="campaign-basic-heading">Basic Information</h2>
              <p className="text-muted">
                Main details displayed on the public recruitment campaign page.
              </p>

              <div className="form-group">
                <label htmlFor="campaign-name">
                  Campaign Name <span className="required-mark" aria-hidden="true">*</span>
                </label>
                <input
                  ref={registerFieldRef('name')}
                  id="campaign-name"
                  name="name"
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="e.g. SAB Recruitment 2026"
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? 'campaign-name-error' : undefined}
                  disabled={isReadOnly || isBusy}
                />
                {fieldErrors.name && (
                  <p id="campaign-name-error" className="field-error">
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="campaign-club-name">
                  Host Club <span className="required-mark" aria-hidden="true">*</span>
                </label>
                <input
                  ref={registerFieldRef('clubName')}
                  id="campaign-club-name"
                  name="clubName"
                  type="text"
                  value={form.clubName}
                  onChange={(e) => updateField('clubName', e.target.value)}
                  placeholder="e.g. Student Activities Board (SAB)"
                  aria-invalid={Boolean(fieldErrors.clubName)}
                  aria-describedby={fieldErrors.clubName ? 'campaign-club-name-error' : undefined}
                  disabled={isReadOnly || isBusy}
                />
                {fieldErrors.clubName && (
                  <p id="campaign-club-name-error" className="field-error">
                    {fieldErrors.clubName}
                  </p>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="campaign-description">
                  Campaign Description <span className="required-mark" aria-hidden="true">*</span>
                </label>
                <textarea
                  ref={registerFieldRef('description')}
                  id="campaign-description"
                  name="description"
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Introduce your club, activities, and what applicants can expect..."
                  aria-invalid={Boolean(fieldErrors.description)}
                  aria-describedby={
                    fieldErrors.description ? 'campaign-description-error' : 'campaign-description-hint'
                  }
                  disabled={isReadOnly || isBusy}
                />
                <p id="campaign-description-hint" className="form-hint">
                  Maximum 1000 characters ({form.description.trim().length}/1000).
                </p>
                {fieldErrors.description && (
                  <p id="campaign-description-error" className="field-error">
                    {fieldErrors.description}
                  </p>
                )}
              </div>
            </section>

            <section className="card" aria-labelledby="campaign-timeline-heading">
              <h2 id="campaign-timeline-heading">Application &amp; Interview Timeline</h2>
              <p className="text-muted">
                Keep one consistent timeline: closing date must be after opening date, and interview date must be after closing date.
              </p>

              <div className="form-grid-3">
                <div className="form-group">
                  <label htmlFor="campaign-opening-date">
                    Opening Date <span className="required-mark" aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={registerFieldRef('openingDate')}
                    id="campaign-opening-date"
                    name="openingDate"
                    type="date"
                    value={form.openingDate}
                    onChange={(e) => updateField('openingDate', e.target.value)}
                    aria-invalid={Boolean(fieldErrors.openingDate)}
                    aria-describedby={fieldErrors.openingDate ? 'campaign-opening-date-error' : undefined}
                    disabled={isReadOnly || isBusy}
                  />
                  {fieldErrors.openingDate && (
                    <p id="campaign-opening-date-error" className="field-error">
                      {fieldErrors.openingDate}
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="campaign-closing-date">
                    Closing Date <span className="required-mark" aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={registerFieldRef('closingDate')}
                    id="campaign-closing-date"
                    name="closingDate"
                    type="date"
                    value={form.closingDate}
                    onChange={(e) => updateField('closingDate', e.target.value)}
                    aria-invalid={Boolean(fieldErrors.closingDate)}
                    aria-describedby={fieldErrors.closingDate ? 'campaign-closing-date-error' : undefined}
                    disabled={isReadOnly || isBusy}
                  />
                  {fieldErrors.closingDate && (
                    <p id="campaign-closing-date-error" className="field-error">
                      {fieldErrors.closingDate}
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="campaign-interview-date">
                    Interview Date <span className="required-mark" aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={registerFieldRef('interviewDate')}
                    id="campaign-interview-date"
                    name="interviewDate"
                    type="date"
                    value={form.interviewDate}
                    onChange={(e) => updateField('interviewDate', e.target.value)}
                    aria-invalid={Boolean(fieldErrors.interviewDate)}
                    aria-describedby={fieldErrors.interviewDate ? 'campaign-interview-date-error' : undefined}
                    disabled={isReadOnly || isBusy}
                  />
                  {fieldErrors.interviewDate && (
                    <p id="campaign-interview-date-error" className="field-error">
                      {fieldErrors.interviewDate}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="card" aria-labelledby="campaign-positions-heading">
              <div className="section-header-row">
                <div>
                  <h2 id="campaign-positions-heading">Departments &amp; Positions</h2>
                  <p className="text-muted">
                    Add or remove department and position rows with quotas, descriptions, and requirements.
                  </p>
                </div>
                <div className="header-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleAddPosition('')}
                    aria-describedby={fieldErrors.positions ? 'campaign-positions-error' : undefined}
                    disabled={isReadOnly || isBusy}
                  >
                    + Add Department / Position
                  </button>
                </div>
              </div>

              <datalist id="department-suggestions">
                {departmentSuggestions.map((dept) => (
                  <option key={dept} value={dept} />
                ))}
              </datalist>

              {fieldErrors.positions && (
                <p id="campaign-positions-error" className="field-error" role="alert" style={{ marginBottom: '16px' }}>
                  {fieldErrors.positions}
                </p>
              )}

              {form.positions.length === 0 ? (
                <EmptyState
                  title="No departments or positions configured"
                  message="There are currently 0 positions and 0 vacancies in this campaign. Add at least one department and position row before publishing."
                />
              ) : (
                <div className="positions-stack">
                  {form.positions.map((pos, idx) => {
                    const deptErrKey = `positions[${idx}].department`;
                    const titleErrKey = `positions[${idx}].title`;
                    const quotaErrKey = `positions[${idx}].quota`;
                    const descErrKey = `positions[${idx}].description`;
                    const reqErrKey = `positions[${idx}].requirements`;

                    return (
                      <article
                        key={pos._key}
                        className="position-row-card"
                        aria-labelledby={`position-row-heading-${idx}`}
                      >
                        <div className="position-row-header">
                          <h3 id={`position-row-heading-${idx}`}>
                            Position {idx + 1}
                            {pos.title.trim() ? ` · ${pos.title.trim()}` : ''}
                          </h3>
                          <div className="header-actions">
                            {pos.department.trim() && (
                              <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => handleAddPosition(pos.department.trim())}
                                disabled={isReadOnly || isBusy}
                              >
                                + Add to Department
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() => handleRemovePosition(idx)}
                              disabled={isReadOnly || isBusy}
                              aria-label={`Remove position ${idx + 1}${pos.title.trim() ? `: ${pos.title.trim()}` : ''}`}
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        <div className="form-grid-3">
                          <div className="form-group">
                            <label htmlFor={`pos-${idx}-department`}>
                              Department <span className="required-mark" aria-hidden="true">*</span>
                            </label>
                            <input
                              ref={registerFieldRef(deptErrKey)}
                              id={`pos-${idx}-department`}
                              name={deptErrKey}
                              type="text"
                              list="department-suggestions"
                              value={pos.department}
                              onChange={(e) => updatePositionField(idx, 'department', e.target.value)}
                              placeholder="e.g. Media & Communications"
                              aria-invalid={Boolean(fieldErrors[deptErrKey])}
                              aria-describedby={
                                fieldErrors[deptErrKey] ? `pos-${idx}-department-error` : undefined
                              }
                              disabled={isReadOnly || isBusy}
                            />
                            {fieldErrors[deptErrKey] && (
                              <p id={`pos-${idx}-department-error`} className="field-error">
                                {fieldErrors[deptErrKey]}
                              </p>
                            )}
                          </div>

                          <div className="form-group">
                            <label htmlFor={`pos-${idx}-title`}>
                              Position Title <span className="required-mark" aria-hidden="true">*</span>
                            </label>
                            <input
                              ref={registerFieldRef(titleErrKey)}
                              id={`pos-${idx}-title`}
                              name={titleErrKey}
                              type="text"
                              value={pos.title}
                              onChange={(e) => updatePositionField(idx, 'title', e.target.value)}
                              placeholder="e.g. Content Team Specialist"
                              aria-invalid={Boolean(fieldErrors[titleErrKey])}
                              aria-describedby={
                                fieldErrors[titleErrKey] ? `pos-${idx}-title-error` : undefined
                              }
                              disabled={isReadOnly || isBusy}
                            />
                            {fieldErrors[titleErrKey] && (
                              <p id={`pos-${idx}-title-error`} className="field-error">
                                {fieldErrors[titleErrKey]}
                              </p>
                            )}
                          </div>

                          <div className="form-group">
                            <label htmlFor={`pos-${idx}-quota`}>
                              Vacancy Quota <span className="required-mark" aria-hidden="true">*</span>
                            </label>
                            <input
                              ref={registerFieldRef(quotaErrKey)}
                              id={`pos-${idx}-quota`}
                              name={quotaErrKey}
                              type="number"
                              min={1}
                              max={50}
                              step={1}
                              value={pos.quota}
                              onChange={(e) => updatePositionField(idx, 'quota', e.target.value)}
                              aria-invalid={Boolean(fieldErrors[quotaErrKey])}
                              aria-describedby={
                                fieldErrors[quotaErrKey] ? `pos-${idx}-quota-error` : undefined
                              }
                              disabled={isReadOnly || isBusy}
                            />
                            {fieldErrors[quotaErrKey] && (
                              <p id={`pos-${idx}-quota-error`} className="field-error">
                                {fieldErrors[quotaErrKey]}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="form-grid-2">
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor={`pos-${idx}-description`}>
                              Position Description <span className="required-mark" aria-hidden="true">*</span>
                            </label>
                            <textarea
                              ref={registerFieldRef(descErrKey)}
                              id={`pos-${idx}-description`}
                              name={descErrKey}
                              value={pos.description}
                              onChange={(e) => updatePositionField(idx, 'description', e.target.value)}
                              placeholder="Describe responsibilities for this role..."
                              aria-invalid={Boolean(fieldErrors[descErrKey])}
                              aria-describedby={
                                fieldErrors[descErrKey] ? `pos-${idx}-description-error` : undefined
                              }
                              disabled={isReadOnly || isBusy}
                            />
                            {fieldErrors[descErrKey] && (
                              <p id={`pos-${idx}-description-error`} className="field-error">
                                {fieldErrors[descErrKey]}
                              </p>
                            )}
                          </div>

                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label htmlFor={`pos-${idx}-requirements`}>
                              Requirements <span className="required-mark" aria-hidden="true">*</span>
                            </label>
                            <textarea
                              ref={registerFieldRef(reqErrKey)}
                              id={`pos-${idx}-requirements`}
                              name={reqErrKey}
                              value={pos.requirements}
                              onChange={(e) => updatePositionField(idx, 'requirements', e.target.value)}
                              placeholder="List skills or prerequisites for applicants..."
                              aria-invalid={Boolean(fieldErrors[reqErrKey])}
                              aria-describedby={
                                fieldErrors[reqErrKey] ? `pos-${idx}-requirements-error` : undefined
                              }
                              disabled={isReadOnly || isBusy}
                            />
                            {fieldErrors[reqErrKey] && (
                              <p id={`pos-${idx}-requirements-error`} className="field-error">
                                {fieldErrors[reqErrKey]}
                              </p>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {!isReadOnly && (
                <div style={{ marginTop: '16px' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() =>
                      handleAddPosition(
                        form.positions.length > 0
                          ? form.positions[form.positions.length - 1].department.trim()
                          : ''
                      )
                    }
                    disabled={isBusy}
                  >
                    + Add Position Row
                  </button>
                </div>
              )}
            </section>

            <section className="card" aria-labelledby="campaign-instructions-heading">
              <h2 id="campaign-instructions-heading">Application Instructions</h2>
              <p className="text-muted">
                Tell prospective applicants what to prepare before submitting an application.
              </p>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="campaign-instructions">
                  Instructions for Applicants <span className="required-mark" aria-hidden="true">*</span>
                </label>
                <textarea
                  ref={registerFieldRef('instructions')}
                  id="campaign-instructions"
                  name="instructions"
                  value={form.instructions}
                  onChange={(e) => updateField('instructions', e.target.value)}
                  placeholder="1. Upload your CV in PDF format (max 5 MB)..."
                  aria-invalid={Boolean(fieldErrors.instructions)}
                  aria-describedby={
                    fieldErrors.instructions ? 'campaign-instructions-error' : 'campaign-instructions-hint'
                  }
                  disabled={isReadOnly || isBusy}
                />
                <p id="campaign-instructions-hint" className="form-hint">
                  Maximum 1000 characters ({form.instructions.trim().length}/1000).
                </p>
                {fieldErrors.instructions && (
                  <p id="campaign-instructions-error" className="field-error">
                    {fieldErrors.instructions}
                  </p>
                )}
              </div>
            </section>

            <section className="card action-bar-card" aria-label="Campaign actions">
              <div className="action-bar">
                <div className="header-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleSaveDraft}
                    disabled={isReadOnly || isBusy}
                  >
                    {submittingAction === 'draft' ? 'Saving Draft...' : 'Save as Draft'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleTogglePreview}
                    aria-expanded={showPreview}
                  >
                    {showPreview ? 'Hide Preview' : 'Preview Campaign'}
                  </button>
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isReadOnly || isBusy}
                >
                  {submittingAction === 'publish' ? 'Publishing Campaign...' : 'Publish Campaign'}
                </button>
              </div>
            </section>
          </form>

          {showPreview && (
            <section
              ref={previewRef}
              className="card preview-panel"
              aria-labelledby="campaign-preview-heading"
            >
              <div className="section-header-row">
                <div>
                  <h2 id="campaign-preview-heading">Campaign Preview</h2>
                  <p className="text-muted">
                    Live preview of how visitors and students will see your campaign.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowPreview(false)}
                >
                  Close Preview
                </button>
              </div>

              <div className="preview-summary">
                <p className="preview-club">{form.clubName.trim() || 'Host club not specified'}</p>
                <p className="preview-title">{form.name.trim() || 'Untitled Campaign'}</p>
                <p>{form.description.trim() || 'No campaign description entered yet.'}</p>

                <div className="preview-dates">
                  <span className="badge badge-info badge-wrap">
                    Opening: {form.openingDate || 'Not set'}
                  </span>
                  <span className="badge badge-info badge-wrap">
                    Closing: {form.closingDate || 'Not set'}
                  </span>
                  <span className="badge badge-info badge-wrap">
                    Interview: {form.interviewDate || 'Not set'}
                  </span>
                </div>
              </div>

              <div className="preview-block">
                <h3>Instructions for Applicants</h3>
                <p className="preview-preline">
                  {form.instructions.trim() || 'No applicant instructions entered yet.'}
                </p>
              </div>

              <div className="preview-block">
                <h3>Open Departments &amp; Positions ({form.positions.length})</h3>
                {previewDepartments.length === 0 ? (
                  <p className="text-muted">No positions added yet.</p>
                ) : (
                  <div className="positions-stack">
                    {previewDepartments.map(([deptName, items]) => (
                      <div key={deptName} className="preview-dept-group">
                        <h4>{deptName}</h4>
                        <div className="preview-positions-grid">
                          {items.map((item) => (
                            <div key={item._key} className="preview-position-card">
                              <div className="position-row-header">
                                <strong>{item.title.trim() || 'Untitled Position'}</strong>
                                <span className="badge badge-info">
                                  {Number(item.quota) > 0 ? item.quota : 0} vacancies
                                </span>
                              </div>
                              <p className="text-muted" style={{ marginBottom: '8px' }}>
                                {item.description.trim() || 'No description provided.'}
                              </p>
                              <p style={{ marginBottom: 0 }}>
                                <strong>Requirements:</strong>{' '}
                                {item.requirements.trim() || 'No requirements provided.'}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </Layout>
  );
}
