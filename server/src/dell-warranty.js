// Dell warranty / asset-entitlement lookup.
//
// Auth: OAuth2 client-credentials against Dell's API gateway. You register an app in the
// Dell TechDirect portal (techdirect.dell.com → APIs → Warranty / Asset Entitlement) and
// get a client_id + client_secret. We exchange those for a short-lived bearer token
// (~1h), cache it in memory, and call the v5 asset-entitlements endpoint by service tag.
//
// Credentials live in app_settings (set via /api/dell), NOT env, so they can be managed
// from the Integrations UI like the Freshservice key.
//
// Mock mode: if `dell_api_mock` is enabled (and used as a fallback when no real creds are
// configured), getWarranty* returns deterministic synthetic dates derived from the service
// tag. This lets the whole feature — UI button, bulk refresh, FS write-back — be exercised
// before TechDirect API access is approved. Drop in real keys and it switches automatically.

import { db } from './db.js';

const TOKEN_URL = 'https://apigtwb2c.us.dell.com/auth/oauth/v2/token';
const ENTITLEMENTS_URL = 'https://apigtwb2c.us.dell.com/PROD/sbil/eapi/v5/asset-entitlements';
const MAX_TAGS_PER_REQUEST = 100;   // Dell accepts up to 100 service tags per call

// ----- settings access -----
function getSetting(key) {
  return db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value || null;
}

export function getDellConfig() {
  const clientId = getSetting('dell_api_client_id');
  const clientSecret = getSetting('dell_api_client_secret');
  const mock = getSetting('dell_api_mock') === '1';
  const configured = !!(clientId && clientSecret);
  return {
    clientId,
    clientSecret,
    mock,                          // the raw stored toggle (reflects the UI checkbox)
    configured,
    // Real credentials always win: the mock toggle only takes effect when no real
    // creds are configured. This prevents a left-on toggle from silently pushing
    // synthetic warranty dates into Freshservice once live keys are added.
    effectiveMock: mock && !configured,
  };
}

// True if we can resolve warranties at all right now (real creds OR explicit mock mode).
export function dellAvailable() {
  const { configured, mock } = getDellConfig();
  return configured || mock;
}

// Product-line keywords that mark a device as Dell even when the manufacturer field
// is blank — common in Freshservice imports where only the model came through. Matched
// against manufacturer + model so e.g. a blank-manufacturer "Dell Pro" / "Precision"
// laptop is still recognized. Service tag == serial number.
const DELL_KEYWORDS = ['dell', 'latitude', 'precision', 'optiplex', 'inspiron', 'vostro', 'poweredge', 'wyse', 'xps'];
const DELL_RE = new RegExp(DELL_KEYWORDS.join('|'), 'i');

export function isDellAsset(asset) {
  return DELL_RE.test(`${asset?.manufacturer || ''} ${asset?.model || ''}`);
}

// Extract the Dell service tag from a raw serial. Some units are scanned with a site
// prefix (e.g. "FORD-2VLV9J4", "CORP-DRVJ264"); a Dell service tag never contains a
// dash, so the real tag is the segment after the last dash. A serial with no dash is
// returned trimmed, unchanged. Used only for the Dell lookup — the stored serial is
// left as-is so the scanned device name is preserved.
export function serviceTagFromSerial(serial) {
  const s = String(serial || '').trim();
  const lastDash = s.lastIndexOf('-');
  return lastDash >= 0 ? s.slice(lastDash + 1).trim() : s;
}

// SQL predicate mirroring DELL_RE for set-based queries (bulk refresh, status counts).
// Keywords are hardcoded constants, so inlining them is injection-safe.
export const DELL_SQL_MATCH =
  '(' + DELL_KEYWORDS.map((k) => `manufacturer LIKE '%${k}%' OR model LIKE '%${k}%'`).join(' OR ') + ')';

// ----- token cache -----
let cachedToken = null;       // { value, expiresAt }
function tokenValid() {
  return cachedToken && cachedToken.expiresAt - 60_000 > Date.now();
}

async function getToken({ clientId, clientSecret, fetchImpl }) {
  if (tokenValid()) return cachedToken.value;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Dell token request failed: ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error('Dell token response missing access_token');
  const ttlMs = (Number(json.expires_in) || 3600) * 1000;
  cachedToken = { value: json.access_token, expiresAt: Date.now() + ttlMs };
  return cachedToken.value;
}

// ----- parsing -----
// Normalize a Dell date ("2027-03-14T00:00:00Z" / "2027-03-14T00:00:00") to YYYY-MM-DD,
// matching how warranty_expires_at is stored elsewhere in the app.
function toDateOnly(s) {
  if (!s || typeof s !== 'string') return null;
  return s.slice(0, 10);
}

// Reduce one Dell asset record to the bits we care about. Warranty end = the latest
// entitlement endDate across all service entitlements on the tag.
function summarizeAsset(record) {
  const entitlements = Array.isArray(record?.entitlements) ? record.entitlements : [];
  let warrantyEnd = null;
  for (const e of entitlements) {
    const end = toDateOnly(e.endDate);
    if (end && (!warrantyEnd || end > warrantyEnd)) warrantyEnd = end;
  }
  return {
    serviceTag: record?.serviceTag || null,
    shipDate: toDateOnly(record?.shipDate),
    productLine: record?.productLineDescription || record?.systemDescription || null,
    warrantyEnd,
    invalid: !!record?.invalid,
    entitlementCount: entitlements.length,
  };
}

// ----- mock -----
// Deterministic synthetic warranty derived from the service tag so the same tag always
// yields the same date. Roughly: shipped 200–700 days ago, 3/4/5-year warranty.
function mockSummary(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  const shipAgoDays = 200 + (h % 500);
  const warrantyYears = [3, 4, 5][h % 3];
  const ship = new Date(Date.now() - shipAgoDays * 86400_000);
  const end = new Date(ship);
  end.setFullYear(end.getFullYear() + warrantyYears);
  return {
    serviceTag: tag,
    shipDate: ship.toISOString().slice(0, 10),
    productLine: 'Latitude 5440 (mock)',
    warrantyEnd: end.toISOString().slice(0, 10),
    invalid: false,
    entitlementCount: 1,
  };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ----- public API -----
// Look up warranties for a list of service tags. Returns a Map<serviceTag, summary>.
// `summary` is { serviceTag, shipDate, productLine, warrantyEnd, invalid, entitlementCount }.
// Tags Dell didn't return are simply absent from the Map. Tags are matched
// case-insensitively (Dell upper-cases them).
export async function getWarrantyForServiceTags(tags, { fetchImpl = globalThis.fetch } = {}) {
  const clean = [...new Set((tags || []).map((t) => String(t || '').trim()).filter(Boolean))];
  const result = new Map();
  if (clean.length === 0) return result;

  const { clientId, clientSecret, configured, effectiveMock } = getDellConfig();

  // Real credentials always take precedence. We only return synthetic data when no
  // real creds exist AND mock mode is on; with creds present the toggle is ignored,
  // so a forgotten toggle can't push fake warranty dates to Freshservice.
  if (!configured) {
    if (!effectiveMock) {
      throw new Error('Dell API is not configured — add TechDirect API credentials (or enable mock mode) in Integrations.');
    }
    for (const tag of clean) result.set(tag.toUpperCase(), mockSummary(tag));
    return result;
  }

  for (const batch of chunk(clean, MAX_TAGS_PER_REQUEST)) {
    const token = await getToken({ clientId, clientSecret, fetchImpl });
    const url = `${ENTITLEMENTS_URL}?servicetags=${encodeURIComponent(batch.join(','))}`;
    let res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    // Token might have just expired server-side; refresh once and retry.
    if (res.status === 401) {
      cachedToken = null;
      const fresh = await getToken({ clientId, clientSecret, fetchImpl });
      res = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${fresh}`, Accept: 'application/json' },
      });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Dell entitlements ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    const records = Array.isArray(json) ? json : json?.asset_entitlement_data || [];
    for (const rec of records) {
      const summary = summarizeAsset(rec);
      if (summary.serviceTag) result.set(summary.serviceTag.toUpperCase(), summary);
    }
  }
  return result;
}

// Convenience for a single tag. Returns the summary or null if Dell didn't return it.
export async function getWarrantyForServiceTag(tag, opts) {
  const map = await getWarrantyForServiceTags([tag], opts);
  return map.get(String(tag || '').trim().toUpperCase()) || null;
}
