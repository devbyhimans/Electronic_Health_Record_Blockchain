const BASE_URL = '/api/dashboard';
export const TOKEN_KEY = 'ehr_dashboard_token';
export const USER_KEY = 'ehr_dashboard_user';

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

function hospitalTokenAllowed() {
  return import.meta.env.PROD && import.meta.env.VITE_ACCEPT_HOSPITAL_TOKEN === 'true' && window.location.pathname.startsWith('/dashboard');
}
function hospitalToken() { return hospitalTokenAllowed() ? localStorage.getItem('ehr_hospital_token') : null; }
function decodeDisplayClaims(token) {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
}

export async function fetchApi(endpoint, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY) || hospitalToken();
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('dashboard:unauthorized'));
    throw new ApiError(body.error || 'Please sign in again.', 401);
  }
  if (!response.ok) throw new ApiError(body.error || `Dashboard request failed (${response.status}).`, response.status);
  return Object.hasOwn(body, 'data') ? body.data : body;
}

export async function loginDashboard(username, password) {
  const url = import.meta.env.VITE_HOSPITAL_LOGIN_URL || '/api/hospital/peer0/auth/login';
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success || !body.data?.token) throw new ApiError(body.error || 'Login failed.', response.status || 401);
  const { token, user } = body.data;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
  return user || {};
}

export function logoutDashboard() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function readDashboardUser() {
  try {
    const stored = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    if (stored) return stored;
  } catch { /* fall through */ }
  const token = hospitalToken();
  const claims = token ? decodeDisplayClaims(token) : null;
  return claims ? { username: claims.userId, userId: claims.userId, role: claims.role, mspId: claims.mspId, peer: claims.peer } : null;
}

export function hasDashboardAuth() { return Boolean(localStorage.getItem(TOKEN_KEY) || hospitalToken()); }
