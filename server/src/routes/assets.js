import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler, id, logActivity, pickAssetUpdate, depreciatedValue, notFound } from '../util.js';

export const assetsRouter = Router();

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
  const { status, category, q, location_id, assigned_to, limit = 200 } = req.query;
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
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Number(limit));
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
  const newId = id('ast');
  const data = pickAssetUpdate(req.body);
  if (!data.asset_tag || !data.category || !data.model) {
    return res.status(400).json({ error: 'asset_tag, category, model required' });
  }
  const cols = Object.keys(data);
  const placeholders = cols.map(() => '?').join(',');
  db.prepare(`INSERT INTO assets (id, ${cols.join(',')}) VALUES (?, ${placeholders})`)
    .run(newId, ...cols.map((c) => data[c]));
  logActivity({ kind: 'asset.created', summary: `Created asset ${data.asset_tag} (${data.model})`, ref_type: 'asset', ref_id: newId });
  res.status(201).json(expandAsset(db.prepare('SELECT * FROM assets WHERE id=?').get(newId)));
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
  db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  logActivity({ kind: 'asset.deleted', summary: `Deleted ${asset.asset_tag}`, ref_type: 'asset', ref_id: asset.id });
  res.status(204).end();
}));

assetsRouter.post('/:id/assign', asyncHandler(async (req, res) => {
  const { user_id, note } = req.body;
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return notFound(res, 'Asset');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(400).json({ error: 'user_id invalid' });

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
  const tx = db.transaction(() => {
    db.prepare(`UPDATE assignments SET returned_at = datetime('now') WHERE asset_id = ? AND returned_at IS NULL`).run(asset.id);
    db.prepare(`UPDATE assets SET assigned_to = NULL, assigned_at = NULL, status = 'in_stock', updated_at = datetime('now') WHERE id = ?`).run(asset.id);
  });
  tx();
  logActivity({ kind: 'asset.returned', summary: `${asset.asset_tag} returned${prevUser ? ` from ${prevUser.name}` : ''}`, ref_type: 'asset', ref_id: asset.id });
  res.json(expandAsset(db.prepare('SELECT * FROM assets WHERE id=?').get(asset.id)));
}));

assetsRouter.post('/:id/retire', asyncHandler(async (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return notFound(res, 'Asset');
  db.prepare(`UPDATE assets SET status='retired', retired_at=datetime('now'), assigned_to=NULL, assigned_at=NULL WHERE id=?`).run(asset.id);
  logActivity({ kind: 'asset.retired', summary: `Retired ${asset.asset_tag}`, ref_type: 'asset', ref_id: asset.id });
  res.json(expandAsset(db.prepare('SELECT * FROM assets WHERE id=?').get(asset.id)));
}));
