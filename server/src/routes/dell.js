import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler, logActivity, notFound } from '../util.js';
import {
  getDellConfig,
  isDellAsset,
  getWarrantyForServiceTag,
  getWarrantyForServiceTags,
  serviceTagFromSerial,
  DELL_SQL_MATCH,
} from '../dell-warranty.js';
import { applyAssetChangeInFreshservice } from '../freshservice-writeback.js';

export const dellRouter = Router();

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

// FS write-back target for an asset, or null (local-only asset, or FS not connected).
function fsAssetTarget(asset) {
  const domain = getSetting('freshservice_domain');
  const apiKey = getSetting('freshservice_api_key');
  if (!domain || !apiKey || !asset.external_display_id) return null;
  return { domain, apiKey, displayId: asset.external_display_id };
}

// SQL fragment: Dell assets (by manufacturer or model) that have a serial/service tag.
const DELL_WHERE = `${DELL_SQL_MATCH} AND serial_number IS NOT NULL AND TRIM(serial_number) <> ''`;

// ---------- status ----------

dellRouter.get('/status', asyncHandler(async (_req, res) => {
  const { configured, mock, effectiveMock } = getDellConfig();
  const dellCount = db.prepare(`SELECT COUNT(*) c FROM assets WHERE ${DELL_WHERE}`).get().c;
  const missing = db.prepare(
    `SELECT COUNT(*) c FROM assets WHERE ${DELL_WHERE} AND (warranty_expires_at IS NULL OR warranty_expires_at = '')`
  ).get().c;
  res.json({
    configured,
    mock,                        // saved toggle
    effective_mock: effectiveMock, // whether synthetic data is actually in use
    available: configured || mock,
    dell_asset_count: dellCount,
    missing_warranty_count: missing,
  });
}));

// ---------- credentials ----------

dellRouter.put('/', asyncHandler(async (req, res) => {
  const { client_id, client_secret, mock } = req.body || {};
  if (client_id != null) setSetting('dell_api_client_id', String(client_id).trim());
  // Allow updating the id / mock toggle without resupplying the secret.
  if (client_secret) setSetting('dell_api_client_secret', String(client_secret).trim());
  if (mock != null) setSetting('dell_api_mock', mock ? '1' : '0');
  res.json({ ok: true, ...getDellConfig(), clientSecret: undefined });
}));

dellRouter.delete('/', asyncHandler(async (_req, res) => {
  deleteSetting('dell_api_client_id');
  deleteSetting('dell_api_client_secret');
  deleteSetting('dell_api_mock');
  res.json({ ok: true });
}));

// ---------- bulk refresh ----------
// NOTE: this literal route MUST be registered before '/warranty/:assetId' below —
// Express matches in registration order, so otherwise POST /warranty/refresh would
// match :assetId="refresh" and 404 as "asset not found".

dellRouter.post('/warranty/refresh', asyncHandler(async (req, res) => {
  const onlyMissing = req.body?.only_missing !== false;   // default: only fill blanks
  const pushToFs = req.body?.push_to_fs !== false;         // default: also push to FS

  const where = onlyMissing
    ? `${DELL_WHERE} AND (warranty_expires_at IS NULL OR warranty_expires_at = '')`
    : DELL_WHERE;
  const assets = db.prepare(`SELECT * FROM assets WHERE ${where}`).all();

  if (assets.length === 0) {
    return res.json({ checked: 0, updated: 0, unchanged: 0, not_found: [], errors: [] });
  }

  // tag -> asset(s). Multiple assets can share a service tag in messy data; update them all.
  // serviceTagFromSerial strips any site prefix ("FORD-2VLV9J4" → "2VLV9J4") before lookup.
  const byTag = new Map();
  for (const a of assets) {
    const tag = serviceTagFromSerial(a.serial_number).toUpperCase();
    if (!tag) continue;
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(a);
  }

  let map;
  try {
    map = await getWarrantyForServiceTags([...byTag.keys()]);
  } catch (e) {
    const code = /not configured/.test(e.message) ? 400 : 502;
    return res.status(code).json({ error: e.message });
  }

  const summary = { checked: assets.length, updated: 0, unchanged: 0, not_found: [], errors: [] };
  for (const [tag, group] of byTag) {
    const found = map.get(tag);
    if (!found || !found.warrantyEnd) {
      summary.not_found.push(tag);
      continue;
    }
    for (const asset of group) {
      if (asset.warranty_expires_at === found.warrantyEnd) { summary.unchanged++; continue; }
      try {
        await updateAssetWarranty(asset, found.warrantyEnd, { actor: req.user?.email, pushToFs });
        summary.updated++;
      } catch (e) {
        summary.errors.push({ asset_tag: asset.asset_tag, error: e.message });
      }
    }
  }
  res.json(summary);
}));

// ---------- single asset ----------

dellRouter.post('/warranty/:assetId', asyncHandler(async (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.assetId);
  if (!asset) return notFound(res, 'asset');
  if (!isDellAsset(asset)) {
    return res.status(400).json({ error: 'Not a Dell asset — warranty lookup is Dell-only.' });
  }
  const tag = serviceTagFromSerial(asset.serial_number);
  if (!tag) return res.status(400).json({ error: 'Asset has no serial number / service tag.' });

  let summary;
  try {
    summary = await getWarrantyForServiceTag(tag);
  } catch (e) {
    const code = /not configured/.test(e.message) ? 400 : 502;
    return res.status(code).json({ error: e.message });
  }
  if (!summary) {
    return res.status(404).json({ error: `Dell returned no record for service tag ${tag}.` });
  }
  if (!summary.warrantyEnd) {
    return res.status(422).json({ error: `Dell returned no warranty end date for ${tag}.`, summary });
  }

  const result = await updateAssetWarranty(asset, summary.warrantyEnd, { actor: req.user?.email });
  res.json({ updated: true, warranty_expires_at: summary.warrantyEnd, summary, ...result });
}));

// Write the warranty date locally (+ activity) and best-effort push to Freshservice.
// Local write always succeeds first; an FS failure is surfaced as a warning, not a throw,
// so the local record stays correct even if FS write-back is momentarily down.
async function updateAssetWarranty(asset, warrantyEnd, { actor = 'system', pushToFs = true } = {}) {
  db.transaction(() => {
    db.prepare(`UPDATE assets SET warranty_expires_at = ? WHERE id = ?`).run(warrantyEnd, asset.id);
    logActivity({
      kind: 'asset.warranty_updated',
      summary: `Dell warranty for ${asset.asset_tag} set to ${warrantyEnd}`,
      ref_type: 'asset',
      ref_id: asset.id,
      actor,
    });
  })();

  let fs_warning = null;
  if (pushToFs) {
    const target = fsAssetTarget(asset);
    if (target) {
      try {
        const { warnings } = await applyAssetChangeInFreshservice({ ...target, warranty: warrantyEnd });
        if (warnings?.length) fs_warning = warnings.join('; ');
      } catch (e) {
        fs_warning = `Freshservice write-back failed: ${e.message}`;
      }
    }
  }
  return { fs_warning };
}
