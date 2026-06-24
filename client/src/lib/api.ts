// Auth is cookie-based (Backend-for-Frontend): the httpOnly session cookie is set by the
// server and sent automatically with same-origin requests. No tokens live in JS anymore.
// We keep a non-sensitive copy of the user profile in localStorage purely for instant UI
// (name/role) on load; the cookie is the real source of truth.
const USER_KEY = 'bmag-itam-user';

export function getCurrentUser(): any | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setCurrentUser(user: any) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function clearSession() {
  localStorage.removeItem(USER_KEY);
}

export function isAdmin(): boolean {
  return getCurrentUser()?.role === 'admin';
}

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`/api${path}`, { ...options, headers, credentials: 'include' });
  if (!res.ok) {
    // Session gone/expired: bounce to login (except when probing /auth/me, which callers handle).
    if (res.status === 401 && path !== '/auth/me') {
      clearSession();
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T = any>(path: string) => request<T>(path),
  post: <T = any>(path: string, body?: any) => request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(path: string, body: any) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T = any>(path: string, body: any) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: async <T = any>(path: string, file: File): Promise<T> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api${path}`, { method: 'POST', body: form, credentials: 'include' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Upload failed');
    return res.json();
  },
};

// Confirm the session with the server and cache the profile. Throws on 401 (not signed in).
export async function fetchMe(): Promise<any> {
  const { user } = await api.get<{ user: any }>('/auth/me');
  setCurrentUser(user);
  return user;
}

// Clear the session server-side, then redirect (to Entra single-sign-out if provided).
export async function logout(): Promise<void> {
  let redirect: string | null = null;
  try {
    const r = await api.post<{ redirect: string | null }>('/auth/logout');
    redirect = r?.redirect ?? null;
  } catch { /* clear locally regardless */ }
  clearSession();
  window.location.href = redirect || '/login';
}
