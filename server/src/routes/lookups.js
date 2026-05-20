import { Router } from 'express';
import { db } from '../db.js';

export const lookupsRouter = Router();

lookupsRouter.get('/locations', (_req, res) => {
  res.json({ data: db.prepare('SELECT * FROM locations ORDER BY name').all() });
});

lookupsRouter.get('/vendors', (_req, res) => {
  res.json({ data: db.prepare('SELECT * FROM vendors ORDER BY name').all() });
});

lookupsRouter.get('/categories', (_req, res) => {
  const rows = db.prepare('SELECT DISTINCT category FROM assets ORDER BY category').all();
  res.json({ data: rows.map((r) => r.category) });
});

lookupsRouter.get('/statuses', (_req, res) => {
  res.json({ data: ['in_stock', 'deployed', 'maintenance', 'retired', 'lost'] });
});

lookupsRouter.get('/departments', (_req, res) => {
  const rows = db.prepare(`SELECT DISTINCT department FROM users WHERE department IS NOT NULL ORDER BY department`).all();
  res.json({ data: rows.map((r) => r.department) });
});
