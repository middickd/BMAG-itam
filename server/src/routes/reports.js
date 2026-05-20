import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler, depreciatedValue } from '../util.js';

export const reportsRouter = Router();

reportsRouter.get('/dashboard', asyncHandler(async (_req, res) => {
  const byStatus = db.prepare(`SELECT status, COUNT(*) as count FROM assets GROUP BY status`).all();
  const byCategory = db.prepare(`SELECT category, COUNT(*) as count FROM assets GROUP BY category ORDER BY count DESC`).all();
  const totalAssets = db.prepare(`SELECT COUNT(*) c FROM assets`).get().c;
  const totalUsers = db.prepare(`SELECT COUNT(*) c FROM users`).get().c;
  const totalLicenses = db.prepare(`SELECT COUNT(*) c FROM licenses`).get().c;
  const openTickets = db.prepare(`SELECT COUNT(*) c FROM maintenance WHERE status='open'`).get().c;

  // Cost summary
  const allAssets = db.prepare(`SELECT purchase_cost, purchase_date, depreciation_years, retired_at FROM assets`).all();
  const purchaseTotal = allAssets.reduce((s, a) => s + (a.purchase_cost || 0), 0);
  const depreciatedTotal = allAssets.reduce((s, a) => {
    if (a.retired_at) return s;
    return s + (depreciatedValue(a) || 0);
  }, 0);
  const monthlySoftware = db.prepare(`
    SELECT COALESCE(SUM(
      CASE billing_cycle
        WHEN 'monthly' THEN cost_per_seat * seats
        WHEN 'annual'  THEN (cost_per_seat * seats) / 12.0
        WHEN 'perpetual' THEN 0
        ELSE (cost_per_seat * seats) / 12.0
      END
    ), 0) as monthly
    FROM licenses WHERE cost_per_seat IS NOT NULL
  `).get().monthly;

  // Expiring warranties (next 90 days)
  const expWarranties = db.prepare(`
    SELECT id, asset_tag, model, warranty_expires_at
    FROM assets
    WHERE warranty_expires_at IS NOT NULL
      AND warranty_expires_at >= date('now')
      AND warranty_expires_at <= date('now', '+90 days')
      AND retired_at IS NULL
    ORDER BY warranty_expires_at
    LIMIT 20
  `).all();
  const expLicenses = db.prepare(`
    SELECT l.id, l.expires_at, l.seats, l.seats_used, s.name as software_name, s.publisher
    FROM licenses l JOIN software s ON s.id = l.software_id
    WHERE l.expires_at IS NOT NULL
      AND l.expires_at >= date('now')
      AND l.expires_at <= date('now', '+90 days')
    ORDER BY l.expires_at
    LIMIT 20
  `).all();

  const recentActivity = db.prepare(`SELECT * FROM activity ORDER BY created_at DESC LIMIT 15`).all();

  res.json({
    totals: {
      assets: totalAssets,
      users: totalUsers,
      licenses: totalLicenses,
      open_tickets: openTickets,
    },
    by_status: byStatus,
    by_category: byCategory,
    cost: {
      purchase_total: Math.round(purchaseTotal * 100) / 100,
      depreciated_total: Math.round(depreciatedTotal * 100) / 100,
      monthly_software: Math.round(monthlySoftware * 100) / 100,
    },
    expiring: { warranties: expWarranties, licenses: expLicenses },
    recent_activity: recentActivity,
  });
}));

reportsRouter.get('/by-location', asyncHandler(async (_req, res) => {
  const rows = db.prepare(`
    SELECT l.id, l.name, l.city, COUNT(a.id) as asset_count
    FROM locations l LEFT JOIN assets a ON a.location_id = l.id
    GROUP BY l.id ORDER BY asset_count DESC
  `).all();
  res.json({ data: rows });
}));

reportsRouter.get('/by-department', asyncHandler(async (_req, res) => {
  const rows = db.prepare(`
    SELECT COALESCE(u.department, 'Unassigned') as department,
           COUNT(DISTINCT a.id) as asset_count,
           COUNT(DISTINCT u.id) as user_count
    FROM users u LEFT JOIN assets a ON a.assigned_to = u.id
    GROUP BY u.department ORDER BY asset_count DESC
  `).all();
  res.json({ data: rows });
}));
