import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient, ApiError } from '../api/client';
import { Layout } from '../components/Layout';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAuth } from '../context/AuthContext';

const EMPTY_STATISTICS = {
  totalApplications: 0,
  uniqueApplicants: 0,
  pendingReview: 0,
  shortlisted: 0,
  rejected: 0
};

const EMPTY_PAGINATION = {
  page: 1,
  pageSize: 5,
  totalItems: 0,
  totalPages: 0
};

const SORT_OPTIONS = [
  { value: 'submittedAt:desc', label: 'Newest first', sortBy: 'submittedAt', sortOrder: 'desc' },
  { value: 'submittedAt:asc', label: 'Oldest first', sortBy: 'submittedAt', sortOrder: 'asc' },
  { value: 'applicantName:asc', label: 'Name (A–Z)', sortBy: 'applicantName', sortOrder: 'asc' },
  { value: 'applicantName:desc', label: 'Name (Z–A)', sortBy: 'applicantName', sortOrder: 'desc' },
  { value: 'positionTitle:asc', label: 'Position (A–Z)', sortBy: 'positionTitle', sortOrder: 'asc' },
  { value: 'status:asc', label: 'Status', sortBy: 'status', sortOrder: 'asc' }
];

const STATUS_META = {
  submitted: { label: 'Pending Review', badgeClass: 'badge badge-draft' },
  shortlisted: { label: 'Shortlisted', badgeClass: 'badge badge-success' },
  rejected: { label: 'Rejected', badgeClass: 'badge badge-danger' }
};

function getStatusMeta(status) {
  return STATUS_META[status] || { label: status || 'Pending', badgeClass: 'badge badge-info' };
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return isoString;
  return parsed.toISOString().slice(0, 10);
}

function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes <= 0) return 'PDF';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function getCampaignBadge(campaign) {
  if (!campaign) return null;
  if (campaign.isReadOnly || campaign.status === 'confirmed') {
    return { className: 'badge badge-warning', label: 'Schedule Confirmed · Read-Only' };
  }
  if (campaign.status === 'closed' || campaign.applicationsOpen === false) {
    return { className: 'badge badge-info', label: 'Applications Closed' };
  }
  if (campaign.status === 'published') {
    return { className: 'badge badge-success', label: 'Applications Open' };
  }
  return { className: 'badge badge-draft', label: 'Draft Campaign' };
}

function buildQueryParams({ search, positionId, status, sortBy, sortOrder, page, pageSize }) {
  const params = new URLSearchParams();
  const trimmedSearch = search.trim();
  if (trimmedSearch) params.set('search', trimmedSearch);
  if (positionId && positionId !== 'all') params.set('positionId', positionId);
  params.set('status', status || 'all');
  params.set('sortBy', sortBy || 'submittedAt');
  params.set('sortOrder', sortOrder || 'desc');
  if (page !== undefined) params.set('page', String(page));
  if (pageSize !== undefined) params.set('pageSize', String(pageSize));
  return params;
}

export function ExecutiveApplicationsPage() {
  const { token } = useAuth();

  // Campaign context (positions dropdown + open/closed/read-only state)
  const [campaign, setCampaign] = useState(null);
  const [closingCampaign, setClosingCampaign] = useState(false);

  // List & filter state
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [positionId, setPositionId] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOption, setSortOption] = useState('submittedAt:desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // API list data & loading/error state
  const [applications, setApplications] = useState([]);
  const [statistics, setStatistics] = useState(EMPTY_STATISTICS);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingList, setIsFetchingList] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);

  // Drawer & detail state
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailReloadCount, setDetailReloadCount] = useState(0);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteError, setNoteError] = useState('');

  // Mutation & action feedback state
  const [actionBanner, setActionBanner] = useState(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [decidingStatus, setDecidingStatus] = useState(null);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isLoadingCv, setIsLoadingCv] = useState(false);
  const [cvPreviewUrl, setCvPreviewUrl] = useState('');
  const [cvPreviewId, setCvPreviewId] = useState(null);

  const hasLoadedOnceRef = useRef(false);
  const hasAutoSelectedRef = useRef(false);
  const userClosedDrawerRef = useRef(false);
  const isMutatingRef = useRef(false);
  const drawerRef = useRef(null);
  const cvObjectUrlRef = useRef('');
  const cvAbortRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const activeSort = useMemo(() => {
    return SORT_OPTIONS.find((opt) => opt.value === sortOption) || SORT_OPTIONS[0];
  }, [sortOption]);

  // Revoke any created CV object URL when unmounting or changing preview
  const revokeCvObjectUrl = useCallback(() => {
    if (cvAbortRef.current) {
      cvAbortRef.current.abort();
      cvAbortRef.current = null;
    }
    if (cvObjectUrlRef.current) {
      URL.revokeObjectURL(cvObjectUrlRef.current);
      cvObjectUrlRef.current = '';
    }
    setIsLoadingCv(false);
    setCvPreviewUrl('');
    setCvPreviewId(null);
  }, []);

  useEffect(() => {
    return () => {
      if (cvAbortRef.current) {
        cvAbortRef.current.abort();
      }
      if (cvObjectUrlRef.current) {
        URL.revokeObjectURL(cvObjectUrlRef.current);
      }
    };
  }, []);

  // 350ms debounced search
  useEffect(() => {
    if (searchInput === debouncedSearch) return undefined;
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [searchInput, debouncedSearch]);

  // Load campaign metadata once for position options & closed/read-only state
  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get('/api/campaign', { token, signal: controller.signal })
      .then((data) => {
        if (data?.campaign) {
          setCampaign(data.campaign);
        }
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') return;
        // Campaign metadata is supplementary; list error handling covers API failures
      });

    return () => {
      controller.abort();
    };
  }, [token, reloadCount]);

  // Fetch paginated/filtered applications with AbortController
  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    if (!hasLoadedOnceRef.current) {
      setIsLoading(true);
    } else {
      setIsFetchingList(true);
    }

    const params = buildQueryParams({
      search: debouncedSearch,
      positionId,
      status: statusFilter,
      sortBy: activeSort.sortBy,
      sortOrder: activeSort.sortOrder,
      page,
      pageSize
    });

    apiClient
      .get(`/api/applications?${params.toString()}`, {
        token,
        signal: controller.signal
      })
      .then((data) => {
        const nextApps = Array.isArray(data?.applications) ? data.applications : [];
        const nextStats = data?.statistics || EMPTY_STATISTICS;
        const nextPagination = data?.pagination || {
          page,
          pageSize,
          totalItems: nextApps.length,
          totalPages: nextApps.length > 0 ? 1 : 0
        };

        setApplications(nextApps);
        setStatistics(nextStats);
        setPagination(nextPagination);
        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
        setIsLoading(false);
        setIsFetchingList(false);

        if (!hasAutoSelectedRef.current && !userClosedDrawerRef.current) {
          hasAutoSelectedRef.current = true;
          if (nextApps.length > 0) {
            setSelectedId(nextApps[0].id);
          }
        }
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') return;
        setLoadError(err?.message || 'Unable to load submitted applications.');
        setIsLoading(false);
        setIsFetchingList(false);
      });

    return () => {
      controller.abort();
    };
  }, [
    token,
    debouncedSearch,
    positionId,
    statusFilter,
    activeSort.sortBy,
    activeSort.sortOrder,
    page,
    pageSize,
    reloadCount
  ]);

  // Fetch selected application details for the review drawer
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError('');
      setNoteDraft('');
      setNoteError('');
      revokeCvObjectUrl();
      return undefined;
    }

    const controller = new AbortController();
    setDetail(null);
    setNoteDraft('');
    setIsLoadingDetail(true);
    setDetailError('');
    setNoteError('');
    revokeCvObjectUrl();

    apiClient
      .get(`/api/applications/${encodeURIComponent(selectedId)}`, {
        token,
        signal: controller.signal
      })
      .then((data) => {
        const loaded = data?.application || null;
        setDetail(loaded);
        setNoteDraft(loaded?.internalNote ?? '');
        setIsLoadingDetail(false);
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') return;
        setDetailError(err?.message || 'Unable to load application details.');
        setIsLoadingDetail(false);
      });

    return () => {
      controller.abort();
    };
  }, [token, selectedId, detailReloadCount, revokeCvObjectUrl]);

  const positionOptions = useMemo(() => {
    const map = new Map();
    if (Array.isArray(campaign?.positions)) {
      campaign.positions.forEach((pos) => {
        if (pos?.id) {
          map.set(pos.id, pos.title || pos.id);
        }
      });
    }
    applications.forEach((app) => {
      if (app?.positionId && !map.has(app.positionId)) {
        map.set(app.positionId, app.positionTitle || app.positionId);
      }
    });
    return [...map.entries()].map(([id, title]) => ({ id, title }));
  }, [campaign, applications]);

  const siblingApplications = useMemo(() => {
    if (!detail) return [];
    return applications.filter(
      (app) => app.studentId === detail.studentId && app.id !== detail.id
    );
  }, [applications, detail]);

  const isReadOnly = Boolean(campaign?.isReadOnly || campaign?.status === 'confirmed');
  const isTrueEmpty =
    hasLoadedOnce &&
    !loadError &&
    statistics.totalApplications === 0 &&
    applications.length === 0;
  const hasActiveFilters =
    debouncedSearch.trim() !== '' ||
    searchInput.trim() !== '' ||
    positionId !== 'all' ||
    statusFilter !== 'all';

  const handleRetryList = useCallback(() => {
    setReloadCount((n) => n + 1);
  }, []);

  const handleRetryDetail = useCallback(() => {
    setDetailReloadCount((n) => n + 1);
  }, []);

  const handleClearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setPositionId('all');
    setStatusFilter('all');
    setSortOption('submittedAt:desc');
    setPage(1);
  };

  const handleSelectApplication = (id) => {
    userClosedDrawerRef.current = false;
    setSelectedId(id);
    setActionBanner(null);
    setNoteError('');
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      window.setTimeout(() => {
        drawerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  const handleCloseDrawer = () => {
    userClosedDrawerRef.current = true;
    setSelectedId(null);
    setNoteError('');
    revokeCvObjectUrl();
  };

  const handleMutationError = (err, fallbackMessage) => {
    if (err instanceof ApiError && err.status === 409 && err.code === 'SCHEDULE_CONFIRMED') {
      setCampaign((prev) => (prev ? { ...prev, isReadOnly: true, status: 'confirmed' } : prev));
      setActionBanner({
        type: 'warning',
        title: 'Applications locked (Schedule Confirmed)',
        message:
          err.message ||
          'The interview schedule is confirmed, so screening decisions and notes are now read-only.'
      });
      return;
    }
    if (err instanceof ApiError && err.status === 400 && err.fields?.internalNote) {
      setNoteError(err.fields.internalNote);
    }
    setActionBanner({
      type: 'danger',
      title: 'Action failed',
      message: err?.message || fallbackMessage
    });
  };

  const handleSaveNote = async (e) => {
    e.preventDefault();
    if (!detail || isReadOnly || isMutatingRef.current) return;

    if (noteDraft.length > 1000) {
      setNoteError('Internal note must not exceed 1,000 characters.');
      return;
    }

    isMutatingRef.current = true;
    setIsSavingNote(true);
    setNoteError('');
    setActionBanner(null);

    try {
      const data = await apiClient.patch(
        `/api/applications/${encodeURIComponent(detail.id)}/note`,
        { internalNote: noteDraft },
        { token }
      );
      const updated = data?.application;
      if (updated) {
        setDetail(updated);
        setNoteDraft(updated.internalNote ?? '');
        setApplications((prev) =>
          prev.map((item) =>
            item.id === updated.id
              ? { ...item, internalNote: updated.internalNote ?? '' }
              : item
          )
        );
      }
      setActionBanner({
        type: 'success',
        title: 'Internal note saved',
        message: `Updated Executive note for application ${detail.id} (${detail.fullName}).`
      });
    } catch (err) {
      handleMutationError(err, 'Unable to save internal note.');
    } finally {
      isMutatingRef.current = false;
      setIsSavingNote(false);
    }
  };

  const handleDecision = async (decision) => {
    if (!detail || isReadOnly || isMutatingRef.current) return;

    if (noteDraft.length > 1000) {
      setNoteError('Internal note must not exceed 1,000 characters.');
      return;
    }

    isMutatingRef.current = true;
    setDecidingStatus(decision);
    setNoteError('');
    setActionBanner(null);

    try {
      let currentDetail = detail;

      // Persist unsaved internal note changes before applying the decision
      if (noteDraft !== (detail.internalNote ?? '')) {
        const noteRes = await apiClient.patch(
          `/api/applications/${encodeURIComponent(detail.id)}/note`,
          { internalNote: noteDraft },
          { token }
        );
        if (noteRes?.application) {
          currentDetail = noteRes.application;
          setDetail(currentDetail);
          setNoteDraft(currentDetail.internalNote ?? '');
          setApplications((prev) =>
            prev.map((item) =>
              item.id === currentDetail.id
                ? { ...item, internalNote: currentDetail.internalNote ?? '' }
                : item
            )
          );
        }
      }

      const data = await apiClient.patch(
        `/api/applications/${encodeURIComponent(detail.id)}/decision`,
        { decision },
        { token }
      );

      const updated = data?.application;
      if (updated) {
        setDetail(updated);
        setNoteDraft(updated.internalNote ?? currentDetail.internalNote ?? '');
        setApplications((prev) =>
          prev.map((item) =>
            item.id === updated.id
              ? {
                  ...item,
                  screeningStatus: updated.screeningStatus,
                  internalNote: updated.internalNote ?? item.internalNote
                }
              : item
          )
        );
      }
      if (data?.statistics) {
        setStatistics(data.statistics);
      }

      const label = decision === 'shortlisted' ? 'Shortlisted' : 'Rejected';
      setActionBanner({
        type: 'success',
        title: `Application ${updated?.id || detail.id} marked ${label}`,
        message: `${updated?.fullName || detail.fullName} (${updated?.positionTitle || detail.positionTitle}) is now ${label}. Other applications remain unchanged.`
      });
    } catch (err) {
      handleMutationError(err, 'Unable to record screening decision.');
    } finally {
      isMutatingRef.current = false;
      setDecidingStatus(null);
    }
  };

  const handleExportCsv = async () => {
    if (isExportingCsv) return;
    setIsExportingCsv(true);
    setActionBanner(null);

    try {
      const params = buildQueryParams({
        search: debouncedSearch,
        positionId,
        status: statusFilter,
        sortBy: activeSort.sortBy,
        sortOrder: activeSort.sortOrder
      });
      const blob = await apiClient.get(`/api/applications/export?${params.toString()}`, {
        token,
        responseType: 'blob'
      });

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = 'applications.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

      setActionBanner({
        type: 'info',
        title: 'CSV exported',
        message: 'Filtered applications exported to applications.csv.'
      });
    } catch (err) {
      setActionBanner({
        type: 'danger',
        title: 'Export failed',
        message: err?.message || 'Unable to export applications CSV.'
      });
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleViewCv = async () => {
    if (!detail || isLoadingCv) return;
    if (cvAbortRef.current) {
      cvAbortRef.current.abort();
    }
    const controller = new AbortController();
    cvAbortRef.current = controller;
    const targetId = detail.id;

    setIsLoadingCv(true);
    setActionBanner(null);

    try {
      const cvPath = detail.cvUrl || `/api/applications/${encodeURIComponent(targetId)}/cv`;
      const blob = await apiClient.get(cvPath, {
        token,
        responseType: 'blob',
        signal: controller.signal
      });
      if (controller.signal.aborted || selectedIdRef.current !== targetId) return;
      if (cvObjectUrlRef.current) {
        URL.revokeObjectURL(cvObjectUrlRef.current);
        cvObjectUrlRef.current = '';
      }
      const objectUrl = URL.createObjectURL(blob);
      cvObjectUrlRef.current = objectUrl;
      setCvPreviewUrl(objectUrl);
      setCvPreviewId(targetId);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setActionBanner({
        type: 'danger',
        title: 'CV unavailable',
        message: err?.message || 'Unable to load the attached PDF CV.'
      });
    } finally {
      if (cvAbortRef.current === controller) {
        cvAbortRef.current = null;
        setIsLoadingCv(false);
      }
    }
  };

  const handleCloseApplications = async () => {
    if (!campaign || closingCampaign || isReadOnly) return;
    setClosingCampaign(true);
    setActionBanner(null);
    try {
      const data = await apiClient.post('/api/campaign/close', {}, { token });
      if (data?.campaign) {
        setCampaign(data.campaign);
      }
      setActionBanner({
        type: 'info',
        title: 'Applications closed',
        message: 'New applicant submissions are now closed while you complete review and scheduling.'
      });
    } catch (err) {
      handleMutationError(err, 'Unable to close campaign applications.');
    } finally {
      setClosingCampaign(false);
    }
  };

  const campaignBadge = getCampaignBadge(campaign);
  const canSchedule = (statistics?.shortlisted || 0) >= 1;
  const totalItems = pagination?.totalItems ?? 0;
  const currentPage = pagination?.page ?? page;
  const totalPages = pagination?.totalPages ?? 0;
  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = totalItems === 0 ? 0 : Math.min(totalItems, rangeStart + applications.length - 1);

  return (
    <Layout title="Application Review" topbarLabel="Executive · Step C7">
      <div className="page-header">
        <div className="page-header-top">
          <div>
            <h1>Application Review</h1>
            <p className="page-subtitle">
              {campaign?.name
                ? `${campaign.name} · Closing ${campaign.closingDate} · Interviews ${campaign.interviewDate}`
                : 'Review submitted applications, manage internal notes, and shortlist candidates for interviews.'}
            </p>
          </div>

          <div className="header-actions">
            {campaignBadge && <span className={campaignBadge.className}>{campaignBadge.label}</span>}

            {campaign &&
              campaign.status === 'published' &&
              campaign.applicationsOpen &&
              !isReadOnly && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCloseApplications}
                  disabled={closingCampaign}
                >
                  {closingCampaign ? 'Closing...' : 'Close Applications'}
                </button>
              )}

            <button
              type="button"
              className="btn btn-outline"
              onClick={handleExportCsv}
              disabled={isLoading || Boolean(loadError) || isExportingCsv}
            >
              {isExportingCsv ? 'Exporting...' : 'Export CSV'}
            </button>

            {canSchedule ? (
              <Link to="/executive/scheduling" className="btn btn-primary">
                Continue to Interview Scheduling
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled
                aria-describedby={!canSchedule && !isLoading && !loadError ? 'scheduling-gate-hint' : undefined}
              >
                Continue to Interview Scheduling
              </button>
            )}
          </div>
        </div>

        {!canSchedule && !isLoading && !loadError && (
          <p id="scheduling-gate-hint" className="form-hint">
            Shortlist at least 1 application to enable Interview Scheduling.
          </p>
        )}
      </div>

      {isLoading && (
        <LoadingState
          title="Loading applications"
          message="Fetching submitted applications and screening statistics..."
        />
      )}

      {!isLoading && loadError && !hasLoadedOnce && (
        <ErrorState
          title="Unable to load applications"
          message={loadError}
          onRetry={handleRetryList}
        />
      )}

      {!isLoading && (!loadError || hasLoadedOnce) && (
        <>
          {isReadOnly && (
            <div className="alert alert-warning" role="status" aria-label="Read-only schedule lock">
              <div className="alert-content">
                <div className="alert-title">Applications Locked (Schedule Confirmed)</div>
                <p style={{ marginBottom: 0 }}>
                  The interview schedule has been confirmed in Step C9. Screening decisions and internal notes are now read-only.
                </p>
              </div>
              <Link to="/executive/scheduling" className="btn btn-outline">
                View Confirmed Schedule
              </Link>
            </div>
          )}

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

          {/* KPI Statistics from API */}
          <div className="stats-grid" aria-label="Application statistics">
            <div className="stat-card">
              <div className="stat-value">{statistics.totalApplications}</div>
              <div className="stat-label">
                Total Applications ({statistics.uniqueApplicants} unique)
              </div>
            </div>
            <div className="stat-card stat-warning">
              <div className="stat-value">{statistics.pendingReview}</div>
              <div className="stat-label">Pending Review</div>
            </div>
            <div className="stat-card stat-success">
              <div className="stat-value">{statistics.shortlisted}</div>
              <div className="stat-label">Shortlisted</div>
            </div>
            <div className="stat-card stat-danger">
              <div className="stat-value">{statistics.rejected}</div>
              <div className="stat-label">Rejected</div>
            </div>
          </div>

          {isTrueEmpty ? (
            <EmptyState
              title="No applications submitted yet"
              message="No candidate applications are in this recruitment campaign yet. Submitted applications will appear here for screening."
            />
          ) : (
            <>
              {/* Search, Filter, Sort, Page Size Toolbar */}
              <div className="card" aria-label="Filter and sort applications">
                <div className="review-toolbar">
                  <div className="form-group review-toolbar-search">
                    <label htmlFor="app-search">Search applicants</label>
                    <input
                      id="app-search"
                      type="search"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Name, student ID, email, or ID..."
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="app-position">Position</label>
                    <select
                      id="app-position"
                      value={positionId}
                      onChange={(e) => {
                        setPositionId(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">All positions</option>
                      {positionOptions.map((pos) => (
                        <option key={pos.id} value={pos.id}>
                          {pos.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="app-status">Status</label>
                    <select
                      id="app-status"
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">All statuses ({statistics.totalApplications})</option>
                      <option value="submitted">Pending ({statistics.pendingReview})</option>
                      <option value="shortlisted">Shortlisted ({statistics.shortlisted})</option>
                      <option value="rejected">Rejected ({statistics.rejected})</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="app-sort">Sort by</label>
                    <select
                      id="app-sort"
                      value={sortOption}
                      onChange={(e) => {
                        setSortOption(e.target.value);
                        setPage(1);
                      }}
                    >
                      {SORT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="app-page-size">Per page</label>
                    <select
                      id="app-page-size"
                      value={String(pageSize)}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                    >
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="20">20</option>
                      <option value="50">50</option>
                    </select>
                  </div>
                </div>
              </div>

              {loadError && (
                <ErrorState
                  title="Unable to refresh applications"
                  message={loadError}
                  onRetry={handleRetryList}
                />
              )}

              {/* Persistent List + Side-by-Side Review Drawer */}
              <div className={`review-layout${selectedId ? ' drawer-open' : ''}`}>
                <section aria-labelledby="apps-list-heading">
                  <div className="review-list-header">
                    <h2 id="apps-list-heading">Submitted Applications</h2>
                    <div className="review-list-meta">
                      {isFetchingList && (
                        <span className="badge badge-info" role="status" aria-live="polite">
                          Updating...
                        </span>
                      )}
                      {hasActiveFilters && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={handleClearFilters}
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </div>

                  {applications.length === 0 ? (
                    <div className="state-box state-empty">
                      <p className="state-title">No matching applications</p>
                      <p className="state-message">
                        No applications match your current search or filter selection.
                      </p>
                      {hasActiveFilters && (
                        <div className="state-actions">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleClearFilters}
                          >
                            Clear Filters
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="applicant-card-grid">
                      {applications.map((app) => {
                        const isSelected = app.id === selectedId;
                        const statusInfo = getStatusMeta(app.screeningStatus);
                        return (
                          <article
                            key={app.id}
                            className={`applicant-card${isSelected ? ' active-selected' : ''}`}
                          >
                            <div className="applicant-header">
                              <div className="applicant-title-group">
                                <h3 className="applicant-name">{app.fullName}</h3>
                                <div className="applicant-role">{app.positionTitle}</div>
                              </div>
                              <span className={statusInfo.badgeClass}>{statusInfo.label}</span>
                            </div>

                            <div className="applicant-meta">
                              {app.studentId} · Year {app.yearOfStudy} · {app.major}
                            </div>
                            <div className="applicant-meta">{app.email}</div>

                            <div className="applicant-card-footer">
                              <span className="applicant-meta">
                                {app.id} · Submitted {formatDate(app.submittedAt)}
                              </span>
                              <button
                                type="button"
                                className={`btn ${isSelected ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => handleSelectApplication(app.id)}
                                aria-pressed={isSelected}
                              >
                                {isSelected ? 'Reviewing' : 'Review'}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {/* Pagination Footer */}
                  <div className="pagination-bar" aria-label="Applications pagination">
                    <span className="applicant-meta">
                      {totalItems === 0
                        ? 'Showing 0 applications'
                        : `Showing ${rangeStart}–${rangeEnd} of ${totalItems} applications (Page ${currentPage} of ${Math.max(1, totalPages)})`}
                    </span>
                    <div className="pagination-controls">
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={currentPage <= 1 || isFetchingList}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={totalPages === 0 || currentPage >= totalPages || isFetchingList}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </section>

                {/* Side-by-Side Review Drawer */}
                {selectedId && (
                  <aside
                    ref={drawerRef}
                    className="drawer-panel"
                    aria-labelledby="drawer-heading"
                  >
                    <div className="drawer-header">
                      <div className="drawer-header-text">
                        <h2 id="drawer-heading">
                          {detail ? detail.fullName : `Application ${selectedId}`}
                        </h2>
                        {detail && (
                          <p className="applicant-meta" style={{ marginBottom: 0 }}>
                            {detail.studentId} · Year {detail.yearOfStudy} · {detail.major} ·{' '}
                            {detail.email} · {detail.phone}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline drawer-close-btn"
                        onClick={handleCloseDrawer}
                        aria-label="Close application details"
                      >
                        Close
                      </button>
                    </div>

                    {isLoadingDetail && (
                      <LoadingState
                        title="Loading application details"
                        message={`Fetching statement, CV, and internal note for ${selectedId}...`}
                      />
                    )}

                    {!isLoadingDetail && detailError && (
                      <ErrorState
                        title="Unable to load application details"
                        message={detailError}
                        onRetry={handleRetryDetail}
                      />
                    )}

                    {!isLoadingDetail && !detailError && detail && (
                      <>
                        <div className="drawer-section">
                          <h3 className="drawer-section-title">Position Applied For</h3>
                          <div className="applicant-role">
                            {detail.positionTitle} ({detail.department})
                          </div>
                          {siblingApplications.length > 0 && (
                            <div className="drawer-sibling-list">
                              {siblingApplications.map((other) => (
                                <div key={other.id} className="badge badge-info badge-wrap">
                                  Also applied: {other.positionTitle} ({other.id},{' '}
                                  {getStatusMeta(other.screeningStatus).label}) — decided separately
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="drawer-section">
                          <h3 className="drawer-section-title">Current Status</h3>
                          <span className={getStatusMeta(detail.screeningStatus).badgeClass}>
                            {getStatusMeta(detail.screeningStatus).label}
                          </span>
                          <p className="form-hint">
                            Submitted {formatDate(detail.submittedAt)} · Application {detail.id}
                          </p>
                        </div>

                        <div className="drawer-section">
                          <h3 className="drawer-section-title">
                            Statement of Purpose ({detail.wordCount ?? 0} / 300 words)
                          </h3>
                          <blockquote className="quote-box">
                            {detail.motivationStatement || 'No statement provided.'}
                          </blockquote>
                        </div>

                        <div className="drawer-section">
                          <h3 className="drawer-section-title">Interview Availability</h3>
                          {Array.isArray(detail.availabilitySlots) &&
                          detail.availabilitySlots.length > 0 ? (
                            <div className="drawer-slots">
                              {detail.availabilitySlots.map((slot) => (
                                <span key={slot} className="badge">
                                  {slot}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted">No availability slots recorded.</p>
                          )}
                        </div>

                        <div className="drawer-section">
                          <h3 className="drawer-section-title">Attached CV</h3>
                          <div className="file-attachment-card">
                            <span className="drawer-cv-name">
                              {detail.cvFileName} · {formatFileSize(detail.cvFileSizeBytes)}
                            </span>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={handleViewCv}
                              disabled={isLoadingCv}
                            >
                              {isLoadingCv ? 'Loading CV...' : 'View CV'}
                            </button>
                          </div>

                          {cvPreviewUrl && cvPreviewId === detail.id && (
                            <div className="cv-preview-box">
                              <div className="cv-preview-bar">
                                <span className="applicant-meta">PDF Preview: {detail.cvFileName}</span>
                                <div className="header-actions">
                                  <a
                                    href={cvPreviewUrl}
                                    download={detail.cvFileName}
                                    className="btn btn-outline"
                                  >
                                    Download PDF
                                  </a>
                                  <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={revokeCvObjectUrl}
                                  >
                                    Hide Preview
                                  </button>
                                </div>
                              </div>
                              <iframe
                                title={`CV preview for ${detail.fullName}`}
                                src={cvPreviewUrl}
                                className="cv-preview-frame"
                              />
                            </div>
                          )}
                        </div>

                        <form className="drawer-section" onSubmit={handleSaveNote} noValidate>
                          <h3 className="drawer-section-title">Internal Note</h3>
                          <div className="form-group">
                            <label htmlFor="drawer-internal-note">
                              Executive-only note (not visible to applicants)
                            </label>
                            <textarea
                              id="drawer-internal-note"
                              value={noteDraft}
                              onChange={(e) => {
                                setNoteDraft(e.target.value);
                                if (noteError && e.target.value.length <= 1000) {
                                  setNoteError('');
                                }
                              }}
                              maxLength={1000}
                              disabled={isReadOnly || isSavingNote || decidingStatus !== null}
                              placeholder="Add screening notes for the recruitment team..."
                              aria-invalid={Boolean(noteError)}
                              aria-describedby={
                                noteError ? 'drawer-note-error drawer-note-hint' : 'drawer-note-hint'
                              }
                            />
                            <p id="drawer-note-hint" className="form-hint">
                              {noteDraft.length} / 1,000 characters
                            </p>
                            {noteError && (
                              <p id="drawer-note-error" className="field-error" role="alert">
                                {noteError}
                              </p>
                            )}
                          </div>
                          <button
                            type="submit"
                            className="btn btn-outline"
                            disabled={isReadOnly || isSavingNote || decidingStatus !== null}
                          >
                            {isSavingNote ? 'Saving Note...' : 'Save Note'}
                          </button>
                        </form>

                        <div className="drawer-section drawer-actions">
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => handleDecision('rejected')}
                            disabled={isReadOnly || isSavingNote || decidingStatus !== null}
                          >
                            {decidingStatus === 'rejected' ? 'Rejecting...' : 'Reject'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-success"
                            onClick={() => handleDecision('shortlisted')}
                            disabled={isReadOnly || isSavingNote || decidingStatus !== null}
                          >
                            {decidingStatus === 'shortlisted'
                              ? 'Shortlisting...'
                              : 'Shortlist Candidate'}
                          </button>
                        </div>
                      </>
                    )}
                  </aside>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Layout>
  );
}
