import { Router } from 'express';
import { asyncHandler } from '../util.js';
import {
  authMode, beginLogin, completeLogin, readSession, setSession,
  clearSession, logoutUrl, redirectUri, DEV_ADMIN,
} from '../auth.js';

export const authRouter = Router();

// Only allow returning to a local path (prevents open-redirect).
function safeReturnTo(value) {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

authRouter.get('/me', (req, res) => {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user });
});

// Kick off login. In bypass mode, mint a dev-admin session and bounce home.
authRouter.get('/login', asyncHandler(async (req, res) => {
  const returnTo = safeReturnTo(req.query.returnTo);
  if (authMode === 'bypass') {
    setSession(res, DEV_ADMIN);
    return res.redirect(returnTo);
  }
  const url = await beginLogin(res, returnTo);
  res.redirect(url);
}));

// OIDC redirect target. Validates, sets the session cookie, returns the user to the app.
authRouter.get('/callback', asyncHandler(async (req, res) => {
  try {
    const { returnTo } = await completeLogin(req, res);
    res.redirect(safeReturnTo(returnTo));
  } catch (e) {
    res.redirect(`/login?error=${encodeURIComponent(e.message || 'Sign-in failed')}`);
  }
}));

// Clears the cookie; returns an Entra end-session URL the client should navigate to (if any).
authRouter.post('/logout', asyncHandler(async (_req, res) => {
  clearSession(res);
  res.json({ ok: true, redirect: await logoutUrl() });
}));

// Lightweight status for diagnostics / the login screen.
authRouter.get('/config', (_req, res) => {
  res.json({ mode: authMode, redirectUri });
});

export { authRouter as default };
