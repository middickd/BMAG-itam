// Owns the Freshservice sync lock + scheduled background sync timer.
// Importing this module does not start the timer; the server entrypoint calls
// bootAutoSync() once on startup.

import { db } from './db.js';
import { runSync } from './sync-freshservice.js';

const DEFAULT_INTERVAL_SECONDS = 300;   // 5 min
const MIN_INTERVAL_SECONDS = 60;        // hard floor — Freshservice rate limits
const SETTING_KEY = 'freshservice_auto_sync_seconds';

let inFlight = false;
let timer = null;
let lastResult = null;  // { at, ok, error?, source }

function getSetting(key) {
  return db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value || null;
}

function fsCredentials() {
  return {
    domain: getSetting('freshservice_domain'),
    apiKey: getSetting('freshservice_api_key'),
  };
}

export function isSyncInFlight() {
  return inFlight;
}

export function getLastResult() {
  return lastResult;
}

export function getAutoSyncIntervalSeconds() {
  const raw = getSetting(SETTING_KEY);
  if (raw == null) return DEFAULT_INTERVAL_SECONDS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_INTERVAL_SECONDS;
  return n;  // 0 = disabled
}

export function setAutoSyncIntervalSeconds(seconds) {
  const n = Math.floor(Number(seconds));
  if (!Number.isFinite(n) || n < 0) throw new Error('seconds must be a non-negative integer');
  const clamped = n === 0 ? 0 : Math.max(MIN_INTERVAL_SECONDS, n);
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(SETTING_KEY, String(clamped));
  scheduleAutoSync();
  return clamped;
}

export async function triggerSync({ dryRun = false, source = 'manual' } = {}) {
  if (inFlight) throw new Error('Sync already in progress');
  const { domain, apiKey } = fsCredentials();
  if (!domain || !apiKey) throw new Error('Freshservice is not configured — save domain + API key first');

  inFlight = true;
  try {
    const result = await runSync({ domain, apiKey, dryRun });
    if (!dryRun) lastResult = { at: new Date().toISOString(), ok: true, source };
    return result;
  } catch (e) {
    lastResult = { at: new Date().toISOString(), ok: false, error: e.message, source };
    throw e;
  } finally {
    inFlight = false;
  }
}

export function scheduleAutoSync() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  const seconds = getAutoSyncIntervalSeconds();
  if (seconds <= 0) return;  // disabled

  timer = setInterval(() => {
    if (inFlight) return;
    const { domain, apiKey } = fsCredentials();
    if (!domain || !apiKey) return;  // not configured yet; skip silently
    triggerSync({ source: 'auto' }).catch((e) => {
      console.error('[auto-sync] failed:', e.message);
    });
  }, seconds * 1000);
  // Don't block process exit on this timer
  if (timer.unref) timer.unref();
}

export function bootAutoSync({ runOnBoot = true, log = console.log } = {}) {
  const seconds = getAutoSyncIntervalSeconds();
  const { domain, apiKey } = fsCredentials();
  log(`[auto-sync] interval=${seconds}s configured=${!!(domain && apiKey)}`);
  scheduleAutoSync();
  if (runOnBoot && seconds > 0 && domain && apiKey) {
    setTimeout(() => {
      triggerSync({ source: 'boot' }).catch((e) => {
        console.error('[auto-sync] initial run failed:', e.message);
      });
    }, 2000);
  }
}
