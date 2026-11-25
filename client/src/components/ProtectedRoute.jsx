import { Link, Navigate, useLocation } from 'react-router-dom';
import { getDefaultRouteForRole, useAuth } from '../context/AuthContext';
import { Layout } from './Layout';
import { ErrorState, LoadingState } from './StateViews';

const ROLE_DISPLAY = {
  executive: 'Executive',
  applicant: 'Applicant',
  interviewer: 'Interviewer'
};

export function ProtectedRoute({ allowedRoles, children }) {
  const { user, isAuthenticated, isLoading, sessionError, retrySession } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <Layout title="Checking Session">
        <div className="page-header">
          <h1>Checking session</h1>
          <p className="page-subtitle">Verifying your ClubFlow authentication state.</p>
        </div>
        <LoadingState
          title="Restoring your session"
          message="Please wait while we verify your account."
        />
      </Layout>
    );
  }

  if (sessionError) {
    return (
      <Layout title="Session Error">
        <div className="page-header">
          <h1>Session verification failed</h1>
          <p className="page-subtitle">We could not verify your active session with the server.</p>
        </div>
        <ErrorState
          title="Unable to verify session"
          message={sessionError}
          onRetry={retrySession}
          secondaryAction={{ to: '/login', label: 'Go to Sign In' }}
        />
      </Layout>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    const allowedText = allowedRoles.map((r) => ROLE_DISPLAY[r] || r).join(' or ');
    const currentText = ROLE_DISPLAY[user.role] || user.role;
    const roleHome = getDefaultRouteForRole(user.role);

    return (
      <Layout title="Access Denied">
        <div className="page-header">
          <h1>Access denied</h1>
          <p className="page-subtitle">
            This route is restricted to {allowedText} accounts.
          </p>
        </div>
        <section className="card" aria-labelledby="access-denied-heading">
          <h2 id="access-denied-heading">Permission required</h2>
          <p>
            You are currently signed in as <strong>{user.name}</strong> ({currentText}).
            You do not have permission to view this section.
          </p>
          <div className="header-actions">
            <Link to={roleHome} className="btn btn-primary">
              Go to {currentText} Workspace
            </Link>
            <Link to="/login" className="btn btn-outline">
              Switch Account
            </Link>
          </div>
        </section>
      </Layout>
    );
  }

  return children;
}
