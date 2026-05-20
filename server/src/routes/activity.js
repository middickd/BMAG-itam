import { Router } from 'express';
import { db } from '../db.js';

export const activityRouter = Router();

activityRouter.get('/', (req, res) => {
  const limit = Number(req.query.limit || 50);
  const rows = db.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json({ data: rows });
});
