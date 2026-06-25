import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler, id, logActivity, pickAssetUpdate, depreciatedValue, notFound } from '../util.js';
import {
  createAssetInFreshservice,
  applyAssetChangeInFreshservice,
  deleteAssetInFreshservice,
} from '../freshservice-writeback.js';

export const assetsRouter = Router();

// Freshservice creds live in app_settings (written by the Integrations UI). When
// both are present, new assets are pushed to FS as the system of record; otherwise
// we fall back to a purely local record.
function freshserviceConfig() {
  const domain = db.prepare(`SELECT value FROM app_settings WHERE key = 'freshservice_domain'`).get()?.value;
  const apiKey = db.prepare(`SELECT value FROM app_settings WHERE key = 'freshservice_api_key'`).get()?.value;
  return domain && apiKey ? { domain, apiKey } : null;
}

// Returns { domain, apiKey, displayId } when an asset lives in FS and can be
// addressed for write-back, else null (local-only asset or FS not connected).
function fsAssetTarget(asset) {
  const fs = freshserviceConfig();
  if (!fs || !asset.external_display_id) return null;
  return { ...fs, displayId: asset.external_display_id };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function expandAsset(a) {
  if (!a) return a;
  const user = a.assigned_to ? db.prepare('SELECT id,name,email,department FROM users WHERE id=?').get(a.assigned_to) : null;
  const location = a.location_id ? db.prepare('SELECT id,name,city FROM locations WHERE id=?').get(a.location_id) : null;
  const vendor = a.vendor_id ? db.prepare('SELECT id,name FROM vendors WHERE id=?').get(a.vendor_id) : null;
  return {
    ...a,
    user,
    location,
    vendor,
    depreciated_value: depreciatedValue(a),
  };
}

assetsRouter.get('/', asyncHandler(async (req, res) => {
  const { status, category, q, location_id, assigned_to, limit } = req.query;
  let sql = 'SELECT * FROM assets WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (location_id) { sql += ' AND location_id = ?'; params.push(location_id); }
  if (assigned_to) { sql += ' AND assigned_to = ?'; params.push(assigned_to); }
  if (q) {
    sql += ' AND (asset_tag LIKE ? OR model LIKE ? OR manufacturer LIKE ? OR serial_number LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY created_at DESC';
  // Only cap the result set when the caller asks for one. The Assets page relies on
  // an unbounded list both to render the full fleet and to count it; a silent default
  // limit truncated the table and made the header report e.g. "200 devices".
  if (limit != null && limit !== '') {
    sql += ' LIMIT ?';
    params.push(Number(limit));
  }
  const rows = db.prepare(sql).all(...params);
  res.json({ data: rows.map(expandAsset) });
}));

assetsRouter.get('/:id', asyncHandler(async (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return notFound(res, 'Asset');
  const assignments = db.prepare(`
    SELECT a.*, u.name as user_name, u.email as user_email
    FROM assignments a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.asset_id = ? ORDER BY a.assigned_at DESC
  `).all(req.params.id);
  const maintenance = db.prepare(`
    SELECT * FROM maintenance WHERE asset_id = ? ORDER BY opened_at DESC
  `).all(req.params.id);
  res.json({ ...expandAsset(asset), assignments, maintenance });
}));

assetsRouter.post('/', asyncHandler(async (req, res) => {
  const data = pickAssetUpdate(req.body);
  if (!data.asset_tag || !data.category || !data.model) {
    return res.status(400).json({ error: 'asset_tag, category, model required' });
  }

  // When Freshservice is connected it's the system of record. Create there FIRST;
  // only persist locally on success. A local-only row (no external_id) would be
  // wiped by the next FS sync, so a failed push must NOT leave a ghost behind.
  const fs = freshserviceConfig();
  let external_id = null;
  let external_display_id = null;
  let source = 'local';
  let fsInfo = null;
  if (fs) {
    try {
      fsInfo = await createAssetInFreshservice({ ...fs, asset: data });
      external_id = fsInfo.fsId;
      external_display_id = fsInfo.displayId != null ? String(fsInfo.displayId) : null;
      source = 'freshservice';
    } catch (e) {
      const clientError = e.code === 'FS_NO_ASSET_TYPE' || e.code === 'FS_REQUIRED_FIELDS';
      return res.status(clientError ? 422 : 502).json({
        error: `Freshservice rejected the new asset, so nothing was created: ${e.message}`,
      });
    }
  }

  const newId = id('ast');
  const cols = [...Object.keys(data), 'external_id', 'external_display_id', 'source'];
  const values = [...Object.keys(data).map((c) => data[c]), external_id, external_display_id, source];
  const placeholders = cols.map(() => '?').join(',');
  db.prepare(`INSERT INTO assets (id, ${cols.join(',')}) VALUES (?, ${placeholders})`)
    .run(newId, ...values);
  logActivity({
    kind: 'asset.created',
    summary: `Created asset ${data.asset_tag} (${data.model})${source === 'freshservice' ? ' + pushed to Freshservice' : ''}`,
    ref_type: 'asset',
    ref_id: newId,
  });
  res.status(201).json({
    ...expandAsset(db.prepare('SELECT * FROM assets WHERE id=?').get(newId)),
    freshservice: fsInfo,
  });
}));

assetsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return notFound(res, 'Asset');
  const update = pickAssetUpdate(req.body);
  if (Object.keys(update).length === 0) return res.json(expandAsset(asset));
  const sets = Object.keys(update).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE assets SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(update), req.params.id);
  logActivity({ kind: 'asset.updated', summary: `Updated ${asset.asset_tag}`, ref_type: 'asset', ref_id: asset.id });
  res.json(expandAsset(db.prepare('SELECT * FROM assets WHERE id=?').get(req.params.id)));
}));

assetsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return notFound(res, 'Asset');

  // Delete in Freshservice first (moves it to FS Trash); otherwise the next sync
  // would just re-create the row. On failure, keep the local row intact.
  const target = fsAssetTarget(asset);
  if (target) {
    try {
      await deleteAssetInFreshservice(target);
    } catch (e) {
      return res.status(502).json({ error: `Freshservice rejected the delete, so nothing changed: ${e.message}` });
    }
  }

  db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  logActivity({
    kind: 'asset.deleted',
    summary: `Deleted ${asset.asset_tag}${target ? ' (and trashed in Freshservice)' : ''}`,
    ref_type: 'asset',
    ref_id: asset.id,
  });
  res.status(204).end();
}));

assetsRouter.post('/:id/assign', asyncHandler(async (req, res) => {
  const { user_id, note } = req.body;
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return notFound(res, 'Asset');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(400).json({ error: 'user_id invalid' });

  // Push to Freshservice first (system of record). On failure, change nothing.
  const target = fsAssetTarget(asset);
  if (target) {
    if (!user.external_id) {
      return res.status(422).json({
        error: `${user.name} isn't synced to Freshservice, so the assignment can't be written there. Assign a Freshservice-synced user, or do it in Freshservice.`,
      });
    }
    try {
      await applyAssetChangeInFreshservice({ ...target, status: 'deployed', user: { externalId: user.external_id } });
    } catch (e) {
      return res.status(502).json({ error: `Freshservice rejected the assignment, so nothing changed: ${e.message}` });
    }
  }

  const tx = db.transaction(() => {
    db.prepare(`UPDATE assignments SET returned_at = datetime('now') WHERE asset_id = ? AND returned_at IS NULL`).run(asset.id);
    db.prepare('INSERT INTO assignments (id, asset_id, user_id, note) VALUES (?, ?, ?, ?)').run(id('asn'), asset.id, user_id, note || null);
    db.prepare(`UPDATE assets SET assigned_to = ?, assigned_at = datetime('now'), status = 'deployed', updated_at = datetime('now') WHERE id = ?`).run(user_id, asset.id);
  });
  tx();
  logActivity({ kind: 'asset.assigned', summary: `Assigned ${asset.asset_tag} to ${user.name}`, ref_type: 'asset', ref_id: asset.id, actor: user.name });
  res.json(expandAsset(db.prepare('SELECT * FROM assets WHERE id=?').get(asset.id)));
}));

assetsRouter.post('/:id/checkin', asyncHandler(async (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return notFound(res, 'Asset');
  const prevUser = asset.assigned_to ? db.prepare('SELECT name FROM users WHERE id=?').get(asset.assigned_to) : null;

  const target = fsAssetTarget(asset);
  if (target) {
    try {
      await applyAssetChangeInFreshservice({ ...target, status: 'in_stock', user: 'clear' });
    } catch (e) {
      return res.status(502).json({ error: `Freshservice rejected the check-in, so nothing changed: ${e.message}` });
    }
  }

  const tx = db.transaction(() => {
    db.prepare(`UPDATE assignments SET returned_at = datetime('now') WHERE asset_id = ? AND returned_at IS NULL`).run(asset.id);
    db.prepare(`UPDATE assets SET assigned_to = NULL, assigned_at = NULL, status = 'in_stock', updated_at = datetime('now') WHERE id = ?`).run(asset.id);
  });
  tx();
  logActivity({ kind: 'asset.returned', summary: `${asset.asset_tag} returned${prevUser ? ` from ${prevUser.name}` : ''}`, ref_type: 'asset', ref_id: asset.id });
  res.json(expandAsset(db.prepare('SELECT * FROM assets WHERE id=?').get(asset.id)));
}));

assetsRouter.post('/bulk', asyncHandler(async (req, res) => {
  const { ids, action, user_id, note } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  if (!['assign', 'checkin', 'retire', 'delete'].includes(action)) {
    return res.status(400).json({ error: 'action must be assign|checkin|retire|delete' });
  }

  let assignedUser = null;
  if (action === 'assign') {
    if (!user_id) return res.status(400).json({ error: 'user_id required for assign' });
    assignedUser = db.prepare('SELECT * FROM users WHERE id=?').get(user_id);
    if (!assignedUser) return res.status(400).json({ error: 'user_id invalid' });
  }

  const assets = db.prepare(
    `SELECT * FROM assets WHERE id IN (${ids.map(() => '?').join(',')})`
  ).all(...ids);

  const fsCfg = freshserviceConfig();

  // Apply one asset's local change in its own transaction (matches the
  // assignments/assets denormalization the single-asset routes use).
  const applyLocal = db.transaction((asset) => {
    if (action === 'assign') {
      db.prepare(`UPDATE assignments SET returned_at = datetime('now') WHERE asset_id = ? AND returned_at IS NULL`).run(asset.id);
      db.prepare('INSERT INTO assignments (id, asset_id, user_id, note) VALUES (?, ?, ?, ?)').run(id('asn'), asset.id, user_id, note || null);
      db.prepare(`UPDATE assets SET assigned_to = ?, assigned_at = datetime('now'), status = 'deployed', updated_at = datetime('now') WHERE id = ?`).run(user_id, asset.id);
    } else if (action === 'checkin') {
      db.prepare(`UPDATE assignments SET returned_at = datetime('now') WHERE asset_id = ? AND returned_at IS NULL`).run(asset.id);
      db.prepare(`UPDATE assets SET assigned_to = NULL, assigned_at = NULL, status = 'in_stock', updated_at = datetime('now') WHERE id = ?`).run(asset.id);
    } else if (action === 'retire') {
      db.prepare(`UPDATE assets SET status='retired', retired_at=datetime('now'), assigned_to=NULL, assigned_at=NULL WHERE id=?`).run(asset.id);
    } else if (action === 'delete') {
      db.prepare('DELETE FROM assets WHERE id = ?').run(asset.id);
    }
  });

  // Push each asset to FS (if it lives there) before applying locally, so the
  // change persists through the next sync. FS calls can't share a SQLite
  // transaction, so each asset commits independently; failures are collected and
  // that asset is left untouched. Throttled to stay under FS rate limits.
  const failed = [];
  const skipped = [];
  let affected = 0;
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    if (action === 'assign' && asset.status === 'retired') { skipped.push(asset.asset_tag); continue; }

    const target = fsCfg && asset.external_display_id ? { ...fsCfg, displayId: asset.external_display_id } : null;
    if (target) {
      try {
        if (action === 'assign') {
          if (!assignedUser.external_id) throw new Error(`${assignedUser.name} isn't synced to Freshservice`);
          await applyAssetChangeInFreshservice({ ...target, status: 'deployed', user: { externalId: assignedUser.external_id } });
        } else if (action === 'checkin') {
          await applyAssetChangeInFreshservice({ ...target, status: 'in_stock', user: 'clear' });
        } else if (action === 'retire') {
          await applyAssetChangeInFreshservice({ ...target, status: 'retired', user: 'clear' });
        } else if (action === 'delete') {
          await deleteAssetInFreshservice(target);
        }
      } catch (e) {
        failed.push({ id: asset.id, asset_tag: asset.asset_tag, error: e.message });
        if (i < assets.length - 1) await sleep(200);
        continue;
      }
    }

    applyLocal(asset);
    affected++;
    if (target && i < assets.length - 1) await sleep(200);
  }

  const verb = { assign: 'assigned', checkin: 'checked in', retire: 'retired', delete: 'deleted' }[action];
  logActivity({
    kind: `asset.bulk.${action}`,
    summary: `Bulk ${verb} ${affected} assets${action === 'assign' ? ` to ${assignedUser.name}` : ''}`
      + `${failed.length ? ` (${failed.length} failed in Freshservice)` : ''}`,
  });

  res.json({ affected, failed, skipped });
}));

assetsRouter.post('/:id/notes', asyncHandler(async (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return notFound(res, 'Asset');
  const notes = typeof req.body?.notes === 'string' ? req.body.notes : '';

  // Push to Freshservice first (system of record) so the note survives the next
  // sync, which rewrites our notes column from FS `description`. Change nothing on
  // failure. notes -> FS description; the sync maps description back to notes.
  const target = fsAssetTarget(asset);
  if (target) {
    try {
      await applyAssetChangeInFreshservice({ ...target, notes });
    } catch (e) {
      return res.status(502).json({ error: `Freshservice rejected the note, so nothing changed: ${e.message}` });
    }
  }

  db.prepare(`UPDATE assets SET notes = ?, updated_at = datetime('now') WHERE id = ?`).run(notes, asset.id);
  logActivity({
    kind: 'asset.note',
    summary: `Updated notes on ${asset.asset_tag}${target ? ' + pushed to Freshservice' : ''}`,
    ref_type: 'asset',
    ref_id: asset.id,
  });
  res.json(expandAsset(db.prepare('SELECT * FROM assets WHERE id=?').get(asset.id)));
}));

assetsRouter.post('/:id/retire', asyncHandler(async (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return notFound(res, 'Asset');

  const target = fsAssetTarget(asset);
  if (target) {
    try {
      await applyAssetChangeInFreshservice({ ...target, status: 'retired', user: 'clear' });
    } catch (e) {
      return res.status(502).json({ error: `Freshservice rejected the retire, so nothing changed: ${e.message}` });
    }
  }

  db.prepare(`UPDATE assets SET status='retired', retired_at=datetime('now'), assigned_to=NULL, assigned_at=NULL WHERE id=?`).run(asset.id);
  logActivity({ kind: 'asset.retired', summary: `Retired ${asset.asset_tag}`, ref_type: 'asset', ref_id: asset.id });
  res.json(expandAsset(db.prepare('SELECT * FROM assets WHERE id=?').get(asset.id)));
}));
