import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getDefaultRouteForRole, useAuth } from '../context/AuthContext';
import { Layout } from '../components/Layout';

const DEMO_ACCOUNTS = [
  {
    key: 'exec',
    label: 'Executive (exec)',
    role: 'Executive',
    email: 'exec@clubflow.test',
    password: 'exec-demo',
    note: 'Campaign setup, review, scheduling, results'
  },
  {
    key: 'studentA',
    label: 'Applicant (studentA)',
    role: 'Applicant',
    email: 'studenta@clubflow.test',
    password: 'studenta-demo',
    note: 'Owns seed applications A01 & A02'
  },
  {
    key: 'int-content',
    label: 'Interviewer · Content (int-content)',
    role: 'Interviewer',
    email: 'int-content@clubflow.test',
    password: 'int-content-demo',
    note: 'Content Team interviews only'
  },
  {
    key: 'int-comms',
    label: 'Interviewer · Comms (int-comms)',
    role: 'Interviewer',
    email: 'int-comms@clubflow.test',
    password: 'int-comms-demo',
    note: 'Communications interviews only'
  }
];

function validateLoginFields(email, password) {
  const errors = {};
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    errors.email = 'Email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.email = 'Enter a valid email address.';
  }
  if (!password.trim()) {
    errors.password = 'Password is required.';
  }
  return errors;
}

export function LoginPage() {
  const { user, isAuthenticated, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const abortRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const isSigningOutRef = useRef(false);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const fromLocation = location.state?.from;
  const returnPath = fromLocation
    ? `${fromLocation.pathname}${fromLocation.search || ''}${fromLocation.hash || ''}`
    : null;

  const handleQuickFill = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setFieldErrors({});
    setFormError('');
  };

  const handleEmailChange = (e) => {
    const nextEmail = e.target.value;
    setEmail(nextEmail);
    if (hasSubmitted) {
      setFieldErrors(validateLoginFields(nextEmail, password));
    } else if (fieldErrors.email) {
      setFieldErrors((prev) => ({ ...prev, email: '' }));
    }
    if (formError) setFormError('');
  };

  const handlePasswordChange = (e) => {
    const nextPassword = e.target.value;
    setPassword(nextPassword);
    if (hasSubmitted) {
      setFieldErrors(validateLoginFields(email, nextPassword));
    } else if (fieldErrors.password) {
      setFieldErrors((prev) => ({ ...prev, password: '' }));
    }
    if (formError) setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingRef.current || submitting) return;

    setHasSubmitted(true);
    setFormError('');

    const clientErrors = validateLoginFields(email, password);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    setFieldErrors({});
    isSubmittingRef.current = true;
    setSubmitting(true);

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await login({
        email: email.trim(),
        password,
        signal: controller.signal
      });
      const destination =
        returnPath && returnPath !== '/login'
          ? returnPath
          : getDefaultRouteForRole(data.user.role);
      navigate(destination, { replace: true });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (err.status === 400 && err.fields && Object.keys(err.fields).length > 0) {
        setFieldErrors(err.fields);
      }
      setFormError(err.message || 'Sign in failed. Please check your credentials.');
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOutRef.current || signingOut) return;
    isSigningOutRef.current = true;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      isSigningOutRef.current = false;
      setSigningOut(false);
    }
  };

  return (
    <Layout title="Sign In" topbarLabel="Authentication · Step C2">
      <div className="page-header">
        <div className="page-header-top">
          <div>
            <h1>Sign in to ClubFlow</h1>
            <p className="page-subtitle">
              Use one of the pre-provisioned demo accounts to access your role workspace.
            </p>
          </div>
          {returnPath && (
            <span className="badge badge-info badge-wrap">
              Return to {returnPath}
            </span>
          )}
        </div>
      </div>

      {isAuthenticated && (
        <div className="alert alert-info" role="status" aria-label="Current active session">
          <div className="alert-content">
            <div className="alert-title">Currently signed in as {user.name}</div>
            <p className="page-subtitle">
              Role: <strong>{user.role}</strong> ({user.email})
              {user.studentId ? ` · Student ID: ${user.studentId}` : ''}
            </p>
          </div>
          <div className="header-actions">
            <Link to={getDefaultRouteForRole(user.role)} className="btn btn-primary">
              Open Workspace
            </Link>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        </div>
      )}

      <div className="login-grid">
        <section className="card" aria-labelledby="login-form-heading">
          <h2 id="login-form-heading">Account Credentials</h2>
          <p className="text-muted">
            Enter your email and password or select a demo account on the right to quick-fill.
          </p>

          {formError && (
            <div className="alert alert-danger" role="alert">
              <div className="alert-content">
                <div className="alert-title">Sign-in error</div>
                <p style={{ marginBottom: 0 }}>{formError}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="login-email">
                Email address <span className="required-mark" aria-hidden="true">*</span>
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={handleEmailChange}
                placeholder="e.g. studenta@clubflow.test"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                disabled={submitting}
              />
              {fieldErrors.email && (
                <p id="login-email-error" className="field-error">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="login-password">
                Password <span className="required-mark" aria-hidden="true">*</span>
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={handlePasswordChange}
                placeholder="Enter your password"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                disabled={submitting}
              />
              {fieldErrors.password && (
                <p id="login-password-error" className="field-error">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="header-actions">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Signing in...' : 'Sign In'}
              </button>
              <Link to="/" className="btn btn-outline">
                Back to Public Campaign
              </Link>
            </div>
          </form>
        </section>

        <section className="card" aria-labelledby="demo-accounts-heading">
          <h2 id="demo-accounts-heading">Demo Accounts (Quick-Fill)</h2>
          <p className="text-muted">
            Select any role below to populate the sign-in form with its demo credentials.
          </p>

          <div className="demo-accounts-list">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.key}
                type="button"
                className="demo-account-btn"
                onClick={() => handleQuickFill(account)}
                disabled={submitting}
              >
                <span className="demo-account-head">
                  <span>{account.label}</span>
                  <span className="badge badge-info">{account.role}</span>
                </span>
                <span className="demo-account-creds">
                  {account.email} / {account.password}
                </span>
                <span className="form-hint">{account.note}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}
