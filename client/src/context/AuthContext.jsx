import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient, getStoredToken, setStoredToken } from '../api/client';

const AuthContext = createContext(null);

export function getDefaultRouteForRole(role) {
  switch (role) {
    case 'executive':
      return '/executive/campaign';
    case 'applicant':
      return '/applications';
    case 'interviewer':
      return '/interviewer/interviews';
    default:
      return '/';
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(getStoredToken()));
  const [sessionError, setSessionError] = useState(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const skipRestoreTokenRef = useRef(null);

  useEffect(() => {
    if (!token) {
      skipRestoreTokenRef.current = null;
      setUser(null);
      setIsLoading(false);
      setSessionError(null);
      return;
    }

    if (skipRestoreTokenRef.current === token) {
      skipRestoreTokenRef.current = null;
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setSessionError(null);

    apiClient
      .get('/api/auth/me', { token, signal: controller.signal })
      .then((data) => {
        setUser(data.user || null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') return;
        if (err.status === 401) {
          setStoredToken(null);
          setToken(null);
          setUser(null);
          setSessionError(null);
        } else {
          setSessionError(err.message || 'Unable to verify your session.');
        }
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [token, restoreAttempt]);

  const retrySession = useCallback(() => {
    skipRestoreTokenRef.current = null;
    setRestoreAttempt((n) => n + 1);
  }, []);

  const login = useCallback(async ({ email, password, signal }) => {
    const data = await apiClient.post(
      '/api/auth/login',
      { email, password },
      { token: null, signal }
    );
    skipRestoreTokenRef.current = data.token;
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
    setSessionError(null);
    setIsLoading(false);
    return data;
  }, []);

  const logout = useCallback(async () => {
    const activeToken = token || getStoredToken();
    try {
      if (activeToken) {
        await apiClient.post('/api/auth/logout', null, { token: activeToken });
      }
    } catch {
      // Always clear local session even if token was already invalidated or server is unreachable
    } finally {
      skipRestoreTokenRef.current = null;
      setStoredToken(null);
      setToken(null);
      setUser(null);
      setSessionError(null);
      setIsLoading(false);
    }
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      isLoading,
      sessionError,
      login,
      logout,
      retrySession
    }),
    [user, token, isLoading, sessionError, login, logout, retrySession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return ctx;
}
