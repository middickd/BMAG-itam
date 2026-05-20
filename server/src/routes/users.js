import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler, id, logActivity, notFound } from '../util.js';

export const usersRouter = Router();

usersRouter.get('/', asyncHandler(async (req, res) => {
  const { q, department } = req.query;
  let sql = 'SELECT * FROM users WHERE 1=1';
  const params = [];
  if (q) {
    sql += ' AND (name LIKE ? OR email LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (department) {
    sql += ' AND department = ?';
    params.push(department);
  }
  sql += ' ORDER BY name';
  const rows = db.prepare(sql).all(...params);
  const withCounts = rows.map((u) => {
    const assets = db.prepare('SELECT COUNT(*) as c FROM assets WHERE assigned_to=?').get(u.id).c;
    const licenses = db.prepare('SELECT COUNT(*) as c FROM license_assignments WHERE user_id=? AND revoked_at IS NULL').get(u.id).c;
    return { ...u, assets_count: assets, licenses_count: licenses };
  });
  res.json({ data: withCounts });
}));

usersRouter.get('/:id', asyncHandler(async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return notFound(res, 'User');
  const assets = db.prepare('SELECT * FROM assets WHERE assigned_to = ? ORDER BY assigned_at DESC').all(req.params.id);
  const licenseAssignments = db.prepare(`
    SELECT la.*, l.software_id, s.name as software_name, l.expires_at
    FROM license_assignments la
    JOIN licenses l ON l.id = la.license_id
    JOIN software s ON s.id = l.software_id
    WHERE la.user_id = ? AND la.revoked_at IS NULL
  `).all(req.params.id);
  res.json({ ...user, assets, licenses: licenseAssignments });
}));

usersRouter.post('/', asyncHandler(async (req, res) => {
  const { email, name, role = 'user', department, title } = req.body;
  if (!email || !name) return res.status(400).json({ error: 'email and name required' });
  const newId = id('usr');
  db.prepare('INSERT INTO users (id, email, name, role, department, title) VALUES (?, ?, ?, ?, ?, ?)')
    .run(newId, email, name, role, department || null, title || null);
  logActivity({ kind: 'user.created', summary: `Added user ${name}`, ref_type: 'user', ref_id: newId });
  res.status(201).json(db.prepare('SELECT * FROM users WHERE id=?').get(newId));
}));
