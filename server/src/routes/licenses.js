import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler, id, logActivity, notFound } from '../util.js';

export const licensesRouter = Router();

licensesRouter.get('/', asyncHandler(async (req, res) => {
  const rows = db.prepare(`
    SELECT l.*, s.name as software_name, s.publisher, s.version, s.category as software_category,
           v.name as vendor_name
    FROM licenses l
    JOIN software s ON s.id = l.software_id
    LEFT JOIN vendors v ON v.id = l.vendor_id
    ORDER BY l.expires_at IS NULL, l.expires_at
  `).all();
  res.json({ data: rows });
}));

licensesRouter.get('/:id', asyncHandler(async (req, res) => {
  const lic = db.prepare(`
    SELECT l.*, s.name as software_name, s.publisher, s.version, s.category as software_category,
           v.name as vendor_name
    FROM licenses l
    JOIN software s ON s.id = l.software_id
    LEFT JOIN vendors v ON v.id = l.vendor_id
    WHERE l.id = ?
  `).get(req.params.id);
  if (!lic) return notFound(res, 'License');
  const assignments = db.prepare(`
    SELECT la.*, u.name as user_name, u.email as user_email, u.department
    FROM license_assignments la
    JOIN users u ON u.id = la.user_id
    WHERE la.license_id = ? AND la.revoked_at IS NULL
    ORDER BY la.assigned_at DESC
  `).all(req.params.id);
  res.json({ ...lic, assignments });
}));

licensesRouter.post('/:id/assign', asyncHandler(async (req, res) => {
  const { user_id } = req.body;
  const lic = db.prepare('SELECT * FROM licenses WHERE id=?').get(req.params.id);
  if (!lic) return notFound(res, 'License');
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(user_id);
  if (!user) return res.status(400).json({ error: 'user_id invalid' });
  if (lic.seats_used >= lic.seats) return res.status(400).json({ error: 'No seats available' });

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO license_assignments (id, license_id, user_id) VALUES (?, ?, ?)').run(id('lic-a'), lic.id, user_id);
    db.prepare('UPDATE licenses SET seats_used = seats_used + 1 WHERE id = ?').run(lic.id);
  });
  tx();
  const software = db.prepare('SELECT name FROM software WHERE id=?').get(lic.software_id);
  logActivity({ kind: 'license.assigned', summary: `Assigned ${software.name} seat to ${user.name}`, ref_type: 'license', ref_id: lic.id });
  res.json(db.prepare('SELECT * FROM licenses WHERE id=?').get(lic.id));
}));

licensesRouter.post('/:id/revoke', asyncHandler(async (req, res) => {
  const { user_id } = req.body;
  const lic = db.prepare('SELECT * FROM licenses WHERE id=?').get(req.params.id);
  if (!lic) return notFound(res, 'License');
  const assignment = db.prepare(`SELECT * FROM license_assignments WHERE license_id=? AND user_id=? AND revoked_at IS NULL`).get(lic.id, user_id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  const tx = db.transaction(() => {
    db.prepare(`UPDATE license_assignments SET revoked_at = datetime('now') WHERE id = ?`).run(assignment.id);
    db.prepare('UPDATE licenses SET seats_used = MAX(0, seats_used - 1) WHERE id = ?').run(lic.id);
  });
  tx();
  const user = db.prepare('SELECT name FROM users WHERE id=?').get(user_id);
  const software = db.prepare('SELECT name FROM software WHERE id=?').get(lic.software_id);
  logActivity({ kind: 'license.revoked', summary: `Revoked ${software.name} seat from ${user?.name || 'user'}`, ref_type: 'license', ref_id: lic.id });
  res.json(db.prepare('SELECT * FROM licenses WHERE id=?').get(lic.id));
}));
