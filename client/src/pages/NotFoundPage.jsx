import { Link, useLocation } from 'react-router-dom';
import { getDefaultRouteForRole, useAuth } from '../context/AuthContext';
import { Layout } from '../components/Layout';

export function NotFoundPage() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();

  return (
    <Layout title="Page Not Found" topbarLabel="404 · Route Not Found">
      <div className="page-header">
        <h1>Page not found</h1>
        <p className="page-subtitle">
          No ClubFlow route matches <code>{location.pathname}</code>.
        </p>
      </div>

      <section className="card" aria-labelledby="not-found-heading">
        <h2 id="not-found-heading">Where would you like to go?</h2>
        <p className="text-muted">
          The URL you entered does not exist or may have been moved. Use one of the links below to continue.
        </p>
        <div className="header-actions">
          <Link to="/" className="btn btn-primary">
            Public Campaign Home
          </Link>
          {isAuthenticated ? (
            <Link to={getDefaultRouteForRole(user.role)} className="btn btn-outline">
              Go to My Workspace
            </Link>
          ) : (
            <Link to="/login" className="btn btn-outline">
              Sign In
            </Link>
          )}
        </div>
      </section>
    </Layout>
  );
}
