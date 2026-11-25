const TOKEN_STORAGE_KEY = 'clubflow_auth_token';

/**
 * Structured API error matching the ClubFlow contract envelope:
 * { error: { code, message, fields } }
 */
export class ApiError extends Error {
  constructor({ status, code = 'API_ERROR', message = 'Request failed.', fields = {} }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields && typeof fields === 'object' ? fields : {};
  }
}

export function getStoredToken() {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors in restricted browsing modes
  }
}

function normalizeApiPath(path) {
  if (!path || typeof path !== 'string') {
    throw new Error('API path must be a non-empty string.');
  }
  if (/^https?:\/\//i.test(path)) {
    throw new Error('Absolute API URLs are prohibited; use relative /api paths.');
  }
  if (path.startsWith('/api/')) return path;
  if (path === '/api') return '/api';
  return path.startsWith('/') ? `/api${path}` : `/api/${path}`;
}

/**
 * Relative /api HTTP client supporting Bearer tokens, AbortSignal, and {status, message, fields} errors.
 */
export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    token,
    signal,
    headers: customHeaders = {},
    responseType = 'json'
  } = options;

  const url = normalizeApiPath(path);
  const headers = new Headers(customHeaders);

  const resolvedToken = token !== undefined ? token : getStoredToken();
  if (resolvedToken) {
    headers.set('Authorization', `Bearer ${resolvedToken}`);
  }

  let requestBody = body;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && body !== null && !isFormData && typeof body !== 'string') {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    requestBody = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : requestBody,
      signal
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw err;
    }
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the server. Please check your connection and try again.',
      fields: {}
    });
  }

  if (!response.ok) {
    let parsed = null;
    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        parsed = await response.json();
      }
    } catch {
      parsed = null;
    }

    const errPayload = parsed && parsed.error ? parsed.error : null;
    throw new ApiError({
      status: response.status,
      code: errPayload?.code || `HTTP_${response.status}`,
      message: errPayload?.message || response.statusText || 'An unexpected server error occurred.',
      fields: errPayload?.fields || {}
    });
  }

  if (responseType === 'blob') {
    return response.blob();
  }
  if (responseType === 'text') {
    return response.text();
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export const apiClient = {
  get: (path, options) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options) => apiRequest(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => apiRequest(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => apiRequest(path, { ...options, method: 'PATCH', body })
};
