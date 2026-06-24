import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler } from '../util.js';
import {
  triggerSync,
  isSyncInFlight,
  getAutoSyncIntervalSeconds,
  setAutoSyncIntervalSeconds,
  getLastResult,
} from '../sync-runner.js';

export const integrationsRouter = Router();

function getSetting(key) {
  return db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value || null;
}
function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value);
}
function deleteSetting(key) {
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

// ---------- Freshservice ----------

integrationsRouter.get('/freshservice', asyncHandler(async (_req, res) => {
  const domain = getSetting('freshservice_domain');
  const apiKey = getSetting('freshservice_api_key');
  const lastSync = db.prepare(`
    SELECT created_at FROM activity
    WHERE kind = 'sync.freshservice'
    ORDER BY created_at DESC LIMIT 1
  `).get();
  const assetCount = db.prepare(`SELECT COUNT(*) c FROM assets WHERE source = 'freshservice'`).get().c;
  const lastResult = getLastResult();
  res.json({
    configured: !!(domain && apiKey),
    domain,
    has_key: !!apiKey,
    last_sync_at: lastSync?.created_at || null,
    last_sync_result: lastResult,
    asset_count: assetCount,
    sync_in_flight: isSyncInFlight(),
    auto_sync_seconds: getAutoSyncIntervalSeconds(),
  });
}));

integrationsRouter.put('/freshservice', asyncHandler(async (req, res) => {
  const { domain, api_key } = req.body || {};
  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ error: 'domain required (e.g. yourorg.freshservice.com)' });
  }
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  setSetting('freshservice_domain', cleanDomain);
  // Allow PUT without api_key to update the domain only (preserves existing key).
  if (api_key) setSetting('freshservice_api_key', api_key);
  res.json({ ok: true });
}));

integrationsRouter.delete('/freshservice', asyncHandler(async (_req, res) => {
  deleteSetting('freshservice_domain');
  deleteSetting('freshservice_api_key');
  res.json({ ok: true });
}));

integrationsRouter.post('/freshservice/sync', asyncHandler(async (req, res) => {
  try {
    const dryRun = req.query.dry_run === '1';
    const result = await triggerSync({ dryRun, source: 'manual' });
    res.json(result);
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('already in progress')) return res.status(409).json({ error: msg });
    if (msg.includes('not configured')) return res.status(400).json({ error: msg });
    res.status(502).json({ error: `Sync failed: ${msg}` });
  }
}));

integrationsRouter.put('/freshservice/auto-sync', asyncHandler(async (req, res) => {
  const { seconds } = req.body || {};
  if (seconds == null) return res.status(400).json({ error: 'seconds required (0 to disable)' });
  try {
    const applied = setAutoSyncIntervalSeconds(seconds);
    res.json({ ok: true, auto_sync_seconds: applied });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));
