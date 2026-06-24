import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler, id, logActivity, notFound } from '../util.js';

export const lookupsRouter = Router();

// ---------- Locations ----------
lookupsRouter.get('/locations', (_req, res) => {
  res.json({ data: db.prepare('SELECT * FROM locations ORDER BY name').all() });
});

lookupsRouter.post('/locations', asyncHandler(async (req, res) => {
  const { name, address, city, country } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const newId = id('loc');
  db.prepare('INSERT INTO locations (id, name, address, city, country) VALUES (?, ?, ?, ?, ?)')
    .run(newId, name, address || null, city || null, country || null);
  logActivity({ kind: 'location.created', summary: `Added location ${name}`, ref_type: 'location', ref_id: newId });
  res.status(201).json(db.prepare('SELECT * FROM locations WHERE id=?').get(newId));
}));

lookupsRouter.patch('/locations/:id', asyncHandler(async (req, res) => {
  const row = db.prepare('SELECT * FROM locations WHERE id=?').get(req.params.id);
  if (!row) return notFound(res, 'Location');
  const fields = ['name', 'address', 'city', 'country'];
  const update = {};
  for (const f of fields) if (f in req.body) update[f] = req.body[f];
  if (Object.keys(update).length === 0) return res.json(row);
  const sets = Object.keys(update).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE locations SET ${sets} WHERE id=?`).run(...Object.values(update), req.params.id);
  logActivity({ kind: 'location.updated', summary: `Updated location ${row.name}`, ref_type: 'location', ref_id: row.id });
  res.json(db.prepare('SELECT * FROM locations WHERE id=?').get(req.params.id));
}));

lookupsRouter.delete('/locations/:id', asyncHandler(async (req, res) => {
  const row = db.prepare('SELECT * FROM locations WHERE id=?').get(req.params.id);
  if (!row) return notFound(res, 'Location');
  const usage = db.prepare('SELECT COUNT(*) c FROM assets WHERE location_id=?').get(req.params.id).c;
  if (usage > 0) return res.status(409).json({ error: `${usage} assets still reference this location` });
  db.prepare('DELETE FROM locations WHERE id=?').run(req.params.id);
  logActivity({ kind: 'location.deleted', summary: `Removed location ${row.name}`, ref_type: 'location', ref_id: row.id });
  res.status(204).end();
}));

// ---------- Vendors ----------
lookupsRouter.get('/vendors', (_req, res) => {
  res.json({ data: db.prepare('SELECT * FROM vendors ORDER BY name').all() });
});

lookupsRouter.post('/vendors', asyncHandler(async (req, res) => {
  const { name, contact_email, website } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const newId = id('vnd');
  db.prepare('INSERT INTO vendors (id, name, contact_email, website) VALUES (?, ?, ?, ?)')
    .run(newId, name, contact_email || null, website || null);
  logActivity({ kind: 'vendor.created', summary: `Added vendor ${name}`, ref_type: 'vendor', ref_id: newId });
  res.status(201).json(db.prepare('SELECT * FROM vendors WHERE id=?').get(newId));
}));

lookupsRouter.patch('/vendors/:id', asyncHandler(async (req, res) => {
  const row = db.prepare('SELECT * FROM vendors WHERE id=?').get(req.params.id);
  if (!row) return notFound(res, 'Vendor');
  const fields = ['name', 'contact_email', 'website'];
  const update = {};
  for (const f of fields) if (f in req.body) update[f] = req.body[f];
  if (Object.keys(update).length === 0) return res.json(row);
  const sets = Object.keys(update).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE vendors SET ${sets} WHERE id=?`).run(...Object.values(update), req.params.id);
  logActivity({ kind: 'vendor.updated', summary: `Updated vendor ${row.name}`, ref_type: 'vendor', ref_id: row.id });
  res.json(db.prepare('SELECT * FROM vendors WHERE id=?').get(req.params.id));
}));

lookupsRouter.delete('/vendors/:id', asyncHandler(async (req, res) => {
  const row = db.prepare('SELECT * FROM vendors WHERE id=?').get(req.params.id);
  if (!row) return notFound(res, 'Vendor');
  const assetUsage = db.prepare('SELECT COUNT(*) c FROM assets WHERE vendor_id=?').get(req.params.id).c;
  const licUsage = db.prepare('SELECT COUNT(*) c FROM licenses WHERE vendor_id=?').get(req.params.id).c;
  if (assetUsage + licUsage > 0) {
    return res.status(409).json({ error: `${assetUsage} assets and ${licUsage} licenses still reference this vendor` });
  }
  db.prepare('DELETE FROM vendors WHERE id=?').run(req.params.id);
  logActivity({ kind: 'vendor.deleted', summary: `Removed vendor ${row.name}`, ref_type: 'vendor', ref_id: row.id });
  res.status(204).end();
}));

// ---------- Read-only lookups ----------
lookupsRouter.get('/categories', (_req, res) => {
  const rows = db.prepare('SELECT DISTINCT category FROM assets ORDER BY category').all();
  res.json({ data: rows.map((r) => r.category) });
});

lookupsRouter.get('/statuses', (_req, res) => {
  res.json({ data: ['in_stock', 'reserved', 'deployed', 'maintenance', 'retired', 'lost'] });
});

lookupsRouter.get('/departments', (_req, res) => {
  const rows = db.prepare(`SELECT DISTINCT department FROM users WHERE department IS NOT NULL ORDER BY department`).all();
  res.json({ data: rows.map((r) => r.department) });
});
