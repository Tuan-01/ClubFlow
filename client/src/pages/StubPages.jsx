import { Link, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';

export function PublicCampaignStubPage() {
  const { isAuthenticated } = useAuth();

  return (
    <Layout title="Public Campaign" topbarLabel="Visitor · Step C1">
      <div className="page-header">
        <div className="page-header-top">
          <div>
            <h1>Club Recruitment Campaign</h1>
            <p className="page-subtitle">
              Public campaign overview, positions, quotas, and application instructions.
            </p>
          </div>
          <span className="badge badge-info">Stub · Member 2 (C1)</span>
        </div>
      </div>

      <section className="card" aria-labelledby="public-stub-heading">
        <h2 id="public-stub-heading">Campaign Landing View Pending Integration</h2>
        <p className="text-muted">
          This placeholder route will load live published campaign details from{' '}
          <code>GET /api/campaign/public</code> in Phase 2.
        </p>
        <div className="header-actions">
          <Link to="/apply" className="btn btn-primary">
            Apply Now
          </Link>
          {!isAuthenticated && (
            <Link to="/login" className="btn btn-outline">
              Sign In
            </Link>
          )}
        </div>
      </section>
    </Layout>
  );
}

export function ApplyStubPage() {
  return (
    <Layout title="Apply" topbarLabel="Applicant · Step C5">
      <div className="page-header">
        <div className="page-header-top">
          <div>
            <h1>Submit Application</h1>
            <p className="page-subtitle">
              Student information, PDF CV upload (up to 5 MB), motivation statement, and availability.
            </p>
          </div>
          <span className="badge badge-info">Stub · Member 2 (C5)</span>
        </div>
      </div>

      <section className="card" aria-labelledby="apply-stub-heading">
        <h2 id="apply-stub-heading">Application Form Pending Integration</h2>
        <p className="text-muted">
          This protected Applicant route will connect to <code>GET /api/campaign/public</code> and{' '}
          <code>POST /api/applications</code> in Phase 2.
        </p>
        <div className="header-actions">
          <Link to="/applications" className="btn btn-primary">
            View My Applications
          </Link>
          <Link to="/" className="btn btn-outline">
            Public Campaign
          </Link>
        </div>
      </section>
    </Layout>
  );
}

export function MyApplicationsStubPage() {
  return (
    <Layout title="My Applications" topbarLabel="Applicant · Step C6">
      <div className="page-header">
        <div className="page-header-top">
          <div>
            <h1>My applications</h1>
            <p className="page-subtitle">
              Track screening status, confirmed interview schedule, and published results.
            </p>
          </div>
          <span className="badge badge-info">Stub · Member 2 (C6)</span>
        </div>
      </div>

      <section className="card" aria-labelledby="my-apps-stub-heading">
        <h2 id="my-apps-stub-heading">Applicant Applications List Pending Integration</h2>
        <p className="text-muted">
          This protected Applicant route will fetch your applications from{' '}
          <code>GET /api/applications/mine</code> in Phase 2.
        </p>
        <div className="header-actions">
          <Link to="/apply" className="btn btn-primary">
            Apply for a Position
          </Link>
          <Link to="/applications/A01" className="btn btn-outline">
            Sample Detail Route (A01)
          </Link>
        </div>
      </section>
    </Layout>
  );
}

export function ApplicationDetailStubPage() {
  const { id } = useParams();

  return (
    <Layout title={`Application ${id}`} topbarLabel={`Applicant · Application ${id}`}>
      <div className="page-header">
        <div className="page-header-top">
          <div>
            <h1>Application {id}</h1>
            <p className="page-subtitle">
              Detailed application view, interview schedule, and final result.
            </p>
          </div>
          <span className="badge badge-info">Stub · Member 2 (C6, C11)</span>
        </div>
      </div>

      <section className="card" aria-labelledby="app-detail-stub-heading">
        <h2 id="app-detail-stub-heading">Application Detail View Pending Integration</h2>
        <p className="text-muted">
          This protected Applicant route will load details for application <strong>{id}</strong> from{' '}
          <code>GET /api/applications/{id}</code> in Phase 2.
        </p>
        <div className="header-actions">
          <Link to="/applications" className="btn btn-primary">
            Back to My Applications
          </Link>
        </div>
      </section>
    </Layout>
  );
}

export function InterviewerInterviewsStubPage() {
  return (
    <Layout title="My Interviews" topbarLabel="Interviewer · Step C10">
      <div className="page-header">
        <div className="page-header-top">
          <div>
            <h1>Assigned Interviews</h1>
            <p className="page-subtitle">
              View confirmed interviews assigned to you, candidate CVs, and submit assessments.
            </p>
          </div>
          <span className="badge badge-info">Stub · Member 2 (C10)</span>
        </div>
      </div>

      <section className="card" aria-labelledby="interviewer-stub-heading">
        <h2 id="interviewer-stub-heading">Interviewer Workspace Pending Integration</h2>
        <p className="text-muted">
          This protected Interviewer route will load assigned interviews from{' '}
          <code>GET /api/interviews/mine</code> in Phase 2.
        </p>
        <div className="header-actions">
          <Link to="/" className="btn btn-outline">
            Public Campaign
          </Link>
        </div>
      </section>
    </Layout>
  );
}

export function ExecutiveRouteStubPage({ title, heading, stepLabel, endpointHint, subtitle }) {
  return (
    <Layout title={title} topbarLabel={`Executive · ${stepLabel}`}>
      <div className="page-header">
        <div className="page-header-top">
          <div>
            <h1>{heading}</h1>
            <p className="page-subtitle">{subtitle}</p>
          </div>
          <span className="badge badge-draft">{stepLabel}</span>
        </div>
      </div>

      <section className="card" aria-labelledby="exec-stub-heading">
        <h2 id="exec-stub-heading">{heading} Workspace</h2>
        <p className="text-muted">
          This protected Executive route is wired to the shell and role guard and will connect to{' '}
          <code>{endpointHint}</code>.
        </p>
        <div className="header-actions">
          <Link to="/executive/campaign" className="btn btn-outline">
            Campaign Setup
          </Link>
          <Link to="/executive/applications" className="btn btn-outline">
            Applications
          </Link>
          <Link to="/executive/scheduling" className="btn btn-outline">
            Scheduling
          </Link>
        </div>
      </section>
    </Layout>
  );
}
