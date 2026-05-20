import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler, id, logActivity, notFound } from '../util.js';

export const maintenanceRouter = Router();

maintenanceRouter.get('/', asyncHandler(async (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT m.*, a.asset_tag, a.model, u.name as reporter_name
    FROM maintenance m
    JOIN assets a ON a.id = m.asset_id
    LEFT JOIN users u ON u.id = m.reported_by
    WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND m.status = ?'; params.push(status); }
  sql += ' ORDER BY m.opened_at DESC';
  res.json({ data: db.prepare(sql).all(...params) });
}));

maintenanceRouter.post('/', asyncHandler(async (req, res) => {
  const { asset_id, type, description, reported_by, assigned_tech, cost } = req.body;
  if (!asset_id || !type) return res.status(400).json({ error: 'asset_id and type required' });
  const asset = db.prepare('SELECT asset_tag FROM assets WHERE id=?').get(asset_id);
  if (!asset) return res.status(400).json({ error: 'Asset not found' });
  const newId = id('mnt');
  db.prepare(`INSERT INTO maintenance (id, asset_id, type, description, reported_by, assigned_tech, cost) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(newId, asset_id, type, description || null, reported_by || null, assigned_tech || null, cost || null);
  db.prepare(`UPDATE assets SET status='maintenance', updated_at=datetime('now') WHERE id=?`).run(asset_id);
  logActivity({ kind: 'maintenance.opened', summary: `Maintenance opened for ${asset.asset_tag}: ${type}`, ref_type: 'maintenance', ref_id: newId });
  res.status(201).json(db.prepare('SELECT * FROM maintenance WHERE id=?').get(newId));
}));

maintenanceRouter.post('/:id/resolve', asyncHandler(async (req, res) => {
  const m = db.prepare('SELECT * FROM maintenance WHERE id=?').get(req.params.id);
  if (!m) return notFound(res, 'Maintenance ticket');
  db.prepare(`UPDATE maintenance SET status='resolved', resolved_at=datetime('now') WHERE id=?`).run(m.id);
  // If no other open tickets, return asset to in_stock or deployed based on assignment
  const open = db.prepare(`SELECT COUNT(*) c FROM maintenance WHERE asset_id=? AND status='open'`).get(m.asset_id).c;
  if (open === 0) {
    const asset = db.prepare('SELECT assigned_to, asset_tag FROM assets WHERE id=?').get(m.asset_id);
    const next = asset.assigned_to ? 'deployed' : 'in_stock';
    db.prepare(`UPDATE assets SET status=?, updated_at=datetime('now') WHERE id=?`).run(next, m.asset_id);
    logActivity({ kind: 'maintenance.resolved', summary: `Resolved maintenance for ${asset.asset_tag}`, ref_type: 'maintenance', ref_id: m.id });
  }
  res.json(db.prepare('SELECT * FROM maintenance WHERE id=?').get(m.id));
}));
