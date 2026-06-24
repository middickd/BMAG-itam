// Entra (Azure AD) SSO via the Backend-for-Frontend pattern, implemented with Node
// built-ins only (crypto + global fetch) — no openid-client/jose/passport. The server is
// the confidential OIDC client: it runs the auth-code+PKCE flow, validates the ID token,
// and issues an HMAC-signed httpOnly session cookie. No tokens are ever exposed to browser JS.
//
// Why hand-rolled: the workspace's npm tree can't be reified on this machine (arborist
// crashes on the mis-cased workspace junctions), so adding deps is currently impossible.
// The flow is small and fully standards-based; see validateIdToken for the security checks.

import crypto from 'node:crypto';

// ----- Config (env is loaded by index.js's `import 'dotenv/config'` before this module) -----
const cfg = {
  tenantId: process.env.ENTRA_TENANT_ID || '',
  clientId: process.env.ENTRA_CLIENT_ID || '',
  clientSecret: process.env.ENTRA_CLIENT_SECRET || '',
  adminGroupId: process.env.ENTRA_ADMIN_GROUP_ID || '',
  appBaseUrl: (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-change-me',
  isProd: process.env.NODE_ENV === 'production',
};

export const entraConfigured = Boolean(cfg.tenantId && cfg.clientId && cfg.clientSecret);

const forcedMode = (process.env.AUTH_MODE || '').toLowerCase();
export const authMode =
  forcedMode === 'entra' ? 'entra' :
  forcedMode === 'bypass' ? 'bypass' :
  (entraConfigured ? 'entra' : 'bypass');

export const redirectUri = `${cfg.appBaseUrl}/api/auth/callback`;
const expectedIssuer = `https://login.microsoftonline.com/${cfg.tenantId}/v2.0`;
const wellKnown = `https://login.microsoftonline.com/${cfg.tenantId}/v2.0/.well-known/openid-configuration`;
const SCOPES = 'openid profile email';

// Identity used in bypass (dev) mode — always admin so local dev is frictionless.
export const DEV_ADMIN = { sub: 'dev-admin', name: 'Dev Admin', email: 'dev@bobmoore.local', role: 'admin' };

const SESSION_COOKIE = 'bmag_session';
const TX_COOKIE = 'bmag_oidc_tx';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h
const TX_TTL_MS = 10 * 60 * 1000;          // 10m to complete login

if (authMode === 'bypass') {
  console.warn('[auth] BYPASS mode (dev): all requests act as a dev admin. ' +
    'Set ENTRA_CLIENT_ID/SECRET (+ AUTH_MODE=entra) for real SSO.');
} else {
  console.log('[auth] Entra SSO enabled. redirect_uri =', redirectUri,
    cfg.adminGroupId ? '' : '(no admin group set — every signed-in user is admin)');
}

// ----- Signed cookie payloads (HMAC-SHA256, base64url) -----
function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function hmac(data) {
  return crypto.createHmac('sha256', cfg.sessionSecret).update(data).digest('base64url');
}
function signPayload(payload, ttlMs) {
  const body = { ...payload, iat: Date.now(), exp: Date.now() + ttlMs };
  const data = b64urlJson(body);
  return `${data}.${hmac(data)}`;
}
function verifyPayload(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = hmac(data);
  if (!sig || sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let body;
  try { body = JSON.parse(Buffer.from(data, 'base64url').toString()); } catch { return null; }
  if (!body || typeof body.exp !== 'number' || body.exp < Date.now()) return null;
  return body;
}

function cookieOpts(maxAgeMs) {
  return { httpOnly: true, sameSite: 'lax', secure: cfg.isProd, path: '/', maxAge: maxAgeMs };
}
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSession(res, user) {
  res.cookie(SESSION_COOKIE, signPayload(user, SESSION_TTL_MS), cookieOpts(SESSION_TTL_MS));
}
export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
export function readSession(req) {
  if (authMode === 'bypass') return DEV_ADMIN;
  return verifyPayload(parseCookies(req)[SESSION_COOKIE]);
}

// ----- OIDC metadata + JWKS (memoized) -----
let _metaP, _jwksP;
function discover() {
  if (!_metaP) {
    _metaP = fetch(wellKnown).then((r) => {
      if (!r.ok) throw new Error(`OIDC discovery failed: ${r.status}`);
      return r.json();
    }).catch((e) => { _metaP = null; throw e; });
  }
  return _metaP;
}
async function getJwks() {
  if (!_jwksP) {
    const meta = await discover();
    _jwksP = fetch(meta.jwks_uri).then((r) => {
      if (!r.ok) throw new Error(`JWKS fetch failed: ${r.status}`);
      return r.json();
    }).then((j) => j.keys).catch((e) => { _jwksP = null; throw e; });
  }
  return _jwksP;
}

// ----- Login: build the authorize URL, stash state/nonce/PKCE in a signed tx cookie -----
export async function beginLogin(res, returnTo) {
  const meta = await discover();
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  res.cookie(TX_COOKIE, signPayload({ state, nonce, codeVerifier, returnTo }, TX_TTL_MS), cookieOpts(TX_TTL_MS));

  const u = new URL(meta.authorization_endpoint);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_mode', 'query');
  u.searchParams.set('scope', SCOPES);
  u.searchParams.set('state', state);
  u.searchParams.set('nonce', nonce);
  u.searchParams.set('code_challenge', codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

// ----- Callback: validate state, exchange code, validate ID token, return the app user -----
export async function completeLogin(req, res) {
  const tx = verifyPayload(parseCookies(req)[TX_COOKIE]);
  res.clearCookie(TX_COOKIE, { path: '/' });
  if (!tx) throw new Error('Login session expired or invalid. Please try again.');

  const { code, state, error, error_description } = req.query;
  if (error) throw new Error(`Entra returned: ${error_description || error}`);
  if (!code || state !== tx.state) throw new Error('Invalid authorization response (state mismatch).');

  const meta = await discover();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: redirectUri,
    code_verifier: tx.codeVerifier,
    scope: SCOPES,
  });
  const tokenRes = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  const tokens = await tokenRes.json();
  if (!tokens.id_token) throw new Error('No id_token in token response.');

  const claims = await validateIdToken(tokens.id_token, tx.nonce);
  const isAdmin = cfg.adminGroupId
    ? Array.isArray(claims.groups) && claims.groups.includes(cfg.adminGroupId)
    : true; // no admin group configured yet -> everyone admin
  const user = {
    sub: claims.oid || claims.sub,
    name: claims.name || claims.preferred_username || 'Unknown',
    email: claims.preferred_username || claims.email || null,
    role: isAdmin ? 'admin' : 'user',
  };
  setSession(res, user);
  return { user, returnTo: tx.returnTo };
}

// Validate the ID token: RS256 signature against the tenant JWKS, plus the standard claim set.
async function validateIdToken(idToken, expectedNonce) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed ID token.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

  // Signature
  const keys = await getJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Signing key not found in JWKS.');
  const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.createVerify('RSA-SHA256')
    .update(`${parts[0]}.${parts[1]}`)
    .verify(pub, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('ID token signature verification failed.');

  // Claims
  const now = Math.floor(Date.now() / 1000);
  const skew = 120;
  if (claims.iss !== expectedIssuer) throw new Error('ID token issuer mismatch.');
  if (claims.aud !== cfg.clientId) throw new Error('ID token audience mismatch.');
  if (cfg.tenantId && claims.tid !== cfg.tenantId) throw new Error('ID token tenant mismatch.');
  if (typeof claims.exp === 'number' && claims.exp + skew < now) throw new Error('ID token expired.');
  if (typeof claims.nbf === 'number' && claims.nbf - skew > now) throw new Error('ID token not yet valid.');
  if (expectedNonce && claims.nonce !== expectedNonce) throw new Error('ID token nonce mismatch.');
  return claims;
}

// End-session URL for single sign-out (null in bypass mode).
export async function logoutUrl() {
  if (authMode === 'bypass') return null;
  const meta = await discover();
  if (!meta.end_session_endpoint) return null;
  const u = new URL(meta.end_session_endpoint);
  u.searchParams.set('post_logout_redirect_uri', `${cfg.appBaseUrl}/login`);
  return u.toString();
}

// ----- Express middleware -----
export function requireAuth(req, res, next) {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

// Read-only enforcement: any mutating request from a non-admin is rejected.
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export function enforceWriteRole(req, res, next) {
  if (MUTATING.has(req.method) && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Read-only access — contact IT to request edit permissions.' });
  }
  next();
}
