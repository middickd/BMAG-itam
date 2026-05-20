import { Router } from 'express';
import { stringify } from 'csv-stringify/sync';
import { db } from '../db.js';
import { asyncHandler } from '../util.js';

export const exportsRouter = Router();

exportsRouter.get('/assets.csv', asyncHandler(async (_req, res) => {
  const rows = db.prepare(`
    SELECT a.asset_tag, a.category, a.model, a.manufacturer, a.serial_number,
           a.status, a.condition, l.name as location, u.name as assigned_to,
           u.email as assigned_email, a.purchase_date, a.purchase_cost,
           a.warranty_expires_at, a.notes
    FROM assets a
    LEFT JOIN locations l ON l.id = a.location_id
    LEFT JOIN users u ON u.id = a.assigned_to
    ORDER BY a.asset_tag
  `).all();
  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="assets.csv"');
  res.send(csv);
}));

exportsRouter.get('/licenses.csv', asyncHandler(async (_req, res) => {
  const rows = db.prepare(`
    SELECT s.name as software, s.publisher, s.version,
           l.seats, l.seats_used, l.cost_per_seat, l.billing_cycle,
           l.purchase_date, l.expires_at, l.license_key
    FROM licenses l JOIN software s ON s.id = l.software_id
    ORDER BY s.name
  `).all();
  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="licenses.csv"');
  res.send(csv);
}));
