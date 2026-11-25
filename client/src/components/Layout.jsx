import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const ROLE_LABELS = {
  executive: 'Executive',
  applicant: 'Applicant',
  interviewer: 'Interviewer'
};

function getInitials(name) {
  if (!name) return 'CF';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function Layout({ title, topbarLabel = 'Student Activities Board (SAB)', children }) {
  useDocumentTitle(title);
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="app-container">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <aside className="app-sidebar" aria-label="Workspace sidebar">
        <div className="brand">
          <Link to="/" className="brand-title">
            ClubFlow
          </Link>
          <span className="brand-badge">Recruitment</span>
        </div>

        <div>
          <div className="nav-group-label">Navigation</div>
          <nav className="sidebar-nav" aria-label="Primary navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              Public Campaign
            </NavLink>

            {!isAuthenticated && (
              <NavLink
                to="/login"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                Sign In
              </NavLink>
            )}

            {isAuthenticated && user.role === 'executive' && (
              <>
                <NavLink
                  to="/executive/campaign"
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  Campaign Setup
                </NavLink>
                <NavLink
                  to="/executive/interview-setup"
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  Interview Setup
                </NavLink>
                <NavLink
                  to="/executive/applications"
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  Applications
                </NavLink>
                <NavLink
                  to="/executive/scheduling"
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  Scheduling
                </NavLink>
                <NavLink
                  to="/executive/results"
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  Results
                </NavLink>
              </>
            )}

            {isAuthenticated && user.role === 'applicant' && (
              <>
                <NavLink
                  to="/apply"
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  Apply
                </NavLink>
                <NavLink
                  to="/applications"
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  My Applications
                </NavLink>
              </>
            )}

            {isAuthenticated && user.role === 'interviewer' && (
              <NavLink
                to="/interviewer/interviews"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                My Interviews
              </NavLink>
            )}
          </nav>
        </div>

        {isAuthenticated && (
          <div className="sidebar-admin">
            <div className="nav-group-label">Account</div>
            <NavLink
              to="/login"
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              Session &amp; Switch Account
            </NavLink>
          </div>
        )}
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-context">{topbarLabel}</div>

          <div className="topbar-user">
            {isAuthenticated ? (
              <>
                <div className="user-avatar" aria-hidden="true">
                  {getInitials(user.name)}
                </div>
                <div className="user-info">
                  <span className="user-name">{user.name}</span>
                  <span className="user-role">
                    {ROLE_LABELS[user.role] || user.role}
                    {user.studentId ? ` · ${user.studentId}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleSignOut}
                  disabled={signingOut}
                >
                  {signingOut ? 'Signing out...' : 'Sign Out'}
                </button>
              </>
            ) : (
              <>
                <span className="badge badge-info">Visitor</span>
                <Link to="/login" className="btn btn-primary">
                  Sign In
                </Link>
              </>
            )}
          </div>
        </header>

        <main className="page-container" id="main-content" tabIndex={-1}>
          {children}
        </main>

        <footer className="app-footer">
          <div className="app-footer-inner">
            <span>ClubFlow · Student Activities Board (SAB) Recruitment Portal</span>
            <Link to="/" className="inline-action-link">
              View Public Campaign
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
