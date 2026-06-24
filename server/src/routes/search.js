import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler } from '../util.js';

export const searchRouter = Router();

searchRouter.get('/', asyncHandler(async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json({ assets: [], users: [], licenses: [] });
  const like = `%${q}%`;

  const assets = db.prepare(`
    SELECT id, asset_tag, model, manufacturer, category, status, serial_number
    FROM assets
    WHERE asset_tag LIKE ? OR model LIKE ? OR manufacturer LIKE ? OR serial_number LIKE ?
    ORDER BY asset_tag
    LIMIT 8
  `).all(like, like, like, like);

  const users = db.prepare(`
    SELECT id, name, email, department, title, avatar_color
    FROM users
    WHERE name LIKE ? OR email LIKE ? OR department LIKE ?
    ORDER BY name
    LIMIT 8
  `).all(like, like, like);

  const licenses = db.prepare(`
    SELECT l.id, l.seats, l.seats_used, l.expires_at, s.name as software_name, s.publisher
    FROM licenses l JOIN software s ON s.id = l.software_id
    WHERE s.name LIKE ? OR s.publisher LIKE ?
    ORDER BY s.name
    LIMIT 8
  `).all(like, like);

  res.json({ assets, users, licenses });
}));
