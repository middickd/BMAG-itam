import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler, depreciatedValue, logActivity } from '../util.js';

export const reportsRouter = Router();

// Sentinel asset_key used to materialize an empty snapshot (0 in_stock at the time
// of capture). Excluded from member lists and counts; ignored by Rebill joins because
// it doesn't match any COALESCE(asset.external_id, asset.id) value.
const EMPTY_SNAPSHOT_MARKER = '__empty__';

// Manual trigger to capture a stock snapshot now. Used as a cron target or button.
reportsRouter.post('/take-snapshot', asyncHandler(async (_req, res) => {
  const snapshotAt = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO asset_stock_snapshots (snapshot_at, asset_key)
    SELECT ?, COALESCE(external_id, id) FROM assets WHERE status = 'in_stock'
  `).run(snapshotAt);
  if (result.changes === 0) {
    db.prepare('INSERT INTO asset_stock_snapshots (snapshot_at, asset_key) VALUES (?, ?)')
      .run(snapshotAt, EMPTY_SNAPSHOT_MARKER);
  }
  res.json({ snapshot_at: snapshotAt, in_stock_count: result.changes });
}));

// ----- Snapshot management (for manual rebill corrections) -----

reportsRouter.get('/snapshots', asyncHandler(async (_req, res) => {
  const rows = db.prepare(`
    SELECT snapshot_at,
           SUM(CASE WHEN asset_key = ? THEN 0 ELSE 1 END) as count
    FROM asset_stock_snapshots
    GROUP BY snapshot_at
    ORDER BY snapshot_at DESC
  `).all(EMPTY_SNAPSHOT_MARKER);
  res.json({ data: rows });
}));

reportsRouter.get('/snapshots/:at', asyncHandler(async (req, res) => {
  const at = req.params.at;
  const exists = db.prepare(`SELECT 1 FROM asset_stock_snapshots WHERE snapshot_at = ? LIMIT 1`).get(at);
  if (!exists) return res.status(404).json({ error: 'Snapshot not found' });
  const rows = db.prepare(`
    SELECT s.asset_key, a.id as asset_id, a.asset_tag, a.model, a.manufacturer, a.category,
           a.status as current_status,
           l.name as location_name,
           u.name as assigned_to_name
    FROM asset_stock_snapshots s
    LEFT JOIN assets a ON COALESCE(a.external_id, a.id) = s.asset_key
    LEFT JOIN locations l ON l.id = a.location_id
    LEFT JOIN users u ON u.id = a.assigned_to
    WHERE s.snapshot_at = ? AND s.asset_key != ?
    ORDER BY a.asset_tag IS NULL, a.asset_tag
  `).all(at, EMPTY_SNAPSHOT_MARKER);
  res.json({ snapshot_at: at, count: rows.length, data: rows });
}));

reportsRouter.post('/snapshots', asyncHandler(async (req, res) => {
  const { snapshot_at, mode = 'current', source_snapshot_at } = req.body || {};
  if (!snapshot_at) return res.status(400).json({ error: 'snapshot_at required (ISO timestamp)' });
  const existing = db.prepare(`SELECT 1 FROM asset_stock_snapshots WHERE snapshot_at = ? LIMIT 1`).get(snapshot_at);
  if (existing) return res.status(409).json({ error: 'A snapshot already exists at that timestamp' });

  let inserted = 0;
  if (mode === 'empty') {
    // No-op insert — but we need at least a marker. Insert a sentinel "(empty)" row? No: just allow the
    // snapshot to exist via members added later. To keep the snapshot visible in the list, write a single
    // tombstone row keyed to a value that won't match any asset, then teach the UI to ignore it. Simpler:
    // require at least one member at creation time for non-current/duplicate modes.
    return res.status(400).json({ error: 'Empty snapshots are not supported — use mode=current or mode=duplicate, then remove unwanted assets' });
  } else if (mode === 'current') {
    const r = db.prepare(`
      INSERT INTO asset_stock_snapshots (snapshot_at, asset_key)
      SELECT ?, COALESCE(external_id, id) FROM assets WHERE status = 'in_stock'
    `).run(snapshot_at);
    inserted = r.changes;
  } else if (mode === 'duplicate') {
    if (!source_snapshot_at) return res.status(400).json({ error: 'source_snapshot_at required when mode=duplicate' });
    const r = db.prepare(`
      INSERT INTO asset_stock_snapshots (snapshot_at, asset_key)
      SELECT ?, asset_key FROM asset_stock_snapshots WHERE snapshot_at = ?
    `).run(snapshot_at, source_snapshot_at);
    inserted = r.changes;
  } else {
    return res.status(400).json({ error: 'mode must be current or duplicate' });
  }

  logActivity({
    kind: 'snapshot.created',
    summary: `Snapshot ${snapshot_at} created (${mode}, ${inserted} members)`,
  });
  res.status(201).json({ snapshot_at, count: inserted });
}));

reportsRouter.delete('/snapshots/:at', asyncHandler(async (req, res) => {
  const at = req.params.at;
  const r = db.prepare(`DELETE FROM asset_stock_snapshots WHERE snapshot_at = ?`).run(at);
  if (r.changes === 0) return res.status(404).json({ error: 'Snapshot not found' });
  logActivity({ kind: 'snapshot.deleted', summary: `Snapshot ${at} deleted (${r.changes} rows)` });
  res.status(204).end();
}));

reportsRouter.post('/snapshots/:at/members', asyncHandler(async (req, res) => {
  const at = req.params.at;
  const { asset_id } = req.body || {};
  if (!asset_id) return res.status(400).json({ error: 'asset_id required' });
  const asset = db.prepare(`SELECT id, external_id, asset_tag FROM assets WHERE id = ?`).get(asset_id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  const key = asset.external_id || asset.id;
  try {
    db.prepare(`INSERT INTO asset_stock_snapshots (snapshot_at, asset_key) VALUES (?, ?)`).run(at, key);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Asset already in this snapshot' });
    }
    throw e;
  }
  logActivity({ kind: 'snapshot.member.added', summary: `Added ${asset.asset_tag} to snapshot ${at}` });
  res.status(201).json({ snapshot_at: at, asset_key: key });
}));

reportsRouter.delete('/snapshots/:at/members/:key', asyncHandler(async (req, res) => {
  const at = req.params.at;
  const key = req.params.key;
  const r = db.prepare(`DELETE FROM asset_stock_snapshots WHERE snapshot_at = ? AND asset_key = ?`).run(at, key);
  if (r.changes === 0) return res.status(404).json({ error: 'Member not found' });
  logActivity({ kind: 'snapshot.member.removed', summary: `Removed ${key} from snapshot ${at}` });
  res.status(204).end();
}));

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

  // In-stock inventory summary (powers the dashboard inventory tile)
  const inStockAssets = db.prepare(`
    SELECT category, purchase_cost, purchase_date, depreciation_years, retired_at
    FROM assets WHERE status = 'in_stock'
  `).all();
  const inStockByCategory = (() => {
    const counts = new Map();
    for (const a of inStockAssets) counts.set(a.category, (counts.get(a.category) || 0) + 1);
    return [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  })();
  const inStockValue = inStockAssets.reduce((s, a) => s + (depreciatedValue(a) || 0), 0);
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
    in_stock: {
      count: inStockAssets.length,
      value: Math.round(inStockValue * 100) / 100,
      by_category: inStockByCategory,
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

reportsRouter.get('/cost-over-time', asyncHandler(async (_req, res) => {
  // Purchase spend by year-month, last 24 months, in-order
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', purchase_date) as month,
           SUM(COALESCE(purchase_cost, 0)) as total,
           COUNT(*) as count
    FROM assets
    WHERE purchase_date IS NOT NULL
      AND purchase_date >= date('now', '-24 months')
    GROUP BY month
    ORDER BY month
  `).all();

  // Fill gaps so the chart has a continuous x-axis
  const out = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const found = rows.find((r) => r.month === key);
    out.push({
      month: key,
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      total: Math.round((found?.total || 0) * 100) / 100,
      count: found?.count || 0,
    });
  }
  res.json({ data: out });
}));

reportsRouter.get('/age-distribution', asyncHandler(async (_req, res) => {
  // Buckets for active (non-retired) assets with a purchase_date.
  const buckets = [
    { key: '0-1y',  min: 0,   max: 1 },
    { key: '1-2y',  min: 1,   max: 2 },
    { key: '2-3y',  min: 2,   max: 3 },
    { key: '3-5y',  min: 3,   max: 5 },
    { key: '5y+',   min: 5,   max: 999 },
  ];
  const assets = db.prepare(`
    SELECT category, purchase_date
    FROM assets
    WHERE purchase_date IS NOT NULL AND retired_at IS NULL
  `).all();

  const now = Date.now();
  const data = buckets.map((b) => ({ bucket: b.key, count: 0 }));
  for (const a of assets) {
    const ageYears = (now - new Date(a.purchase_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    const idx = buckets.findIndex((b) => ageYears >= b.min && ageYears < b.max);
    if (idx >= 0) data[idx].count++;
  }
  res.json({ data });
}));

// ---------- Monthly Rebill ----------
// Per-location itemization of devices that genuinely transitioned from In Stock → In
// Use during the selected month, derived from periodic stock snapshots. We treat the
// most recent snapshot taken AT OR BEFORE the first day of the month as the baseline.
// An asset bills for the month if (a) it was in In Stock at that baseline, (b) it
// has an assignment whose `assigned_at` falls in the month, AND (c) it is currently
// In Use (status = 'deployed'). The status check is what restricts billing to a true
// In Stock → In Use transition: a device that went In Stock → Reserved (e.g. a loaner
// with a borrower) also has an in-month assignment but must NOT bill. This also
// excludes assets created directly in In Use (never appeared in any baseline snapshot).
//
// If no baseline snapshot exists prior to the requested month, we return no rows
// and a `baseline: null` marker so the UI can explain. First billable month is the
// month following the first ever snapshot.

function monthOrDefault(q) {
  const raw = (q || '').toString().trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthStart(month) {
  return `${month}-01`;
}

// Find the most recent snapshot taken at or before the start of the month.
function findBaseline(month) {
  const row = db.prepare(`
    SELECT MAX(snapshot_at) AS at
    FROM asset_stock_snapshots
    WHERE snapshot_at <= ?
  `).get(`${monthStart(month)}T23:59:59Z`);
  return row?.at || null;
}

// Earliest month for which we can produce an accurate rebill = the month after
// the first snapshot's calendar month.
function earliestBillableMonth() {
  const row = db.prepare(`SELECT MIN(snapshot_at) AS at FROM asset_stock_snapshots`).get();
  if (!row?.at) return null;
  const d = new Date(row.at);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildRebill(month) {
  const baseline = findBaseline(month);
  if (!baseline) {
    return {
      month,
      baseline: null,
      earliest_billable_month: earliestBillableMonth(),
      data: [],
      totals: { deployed: 0, rebill_total: 0 },
    };
  }

  const locations = db.prepare(`SELECT id, name FROM locations ORDER BY name`).all();
  const nameById = new Map(locations.map((l) => [l.id, l.name]));

  const rows = db.prepare(`
    SELECT a.location_id as location_id,
           COUNT(*) as deployed,
           COALESCE(SUM(a.purchase_cost), 0) as rebill_total
    FROM assignments asn
    JOIN assets a ON a.id = asn.asset_id
    JOIN asset_stock_snapshots s
      ON s.snapshot_at = ?
     AND s.asset_key = COALESCE(a.external_id, a.id)
    WHERE strftime('%Y-%m', asn.assigned_at) = ?
      AND a.status = 'deployed'
    GROUP BY a.location_id
  `).all(baseline, month);

  const data = rows.map((r) => ({
    location_id: r.location_id,
    location_name: r.location_id ? nameById.get(r.location_id) || '(Unknown)' : '(Unassigned)',
    deployed: r.deployed,
    rebill_total: Math.round((r.rebill_total || 0) * 100) / 100,
  })).sort((a, b) => a.location_name.localeCompare(b.location_name));

  const totals = data.reduce(
    (acc, r) => ({
      deployed: acc.deployed + r.deployed,
      rebill_total: Math.round((acc.rebill_total + r.rebill_total) * 100) / 100,
    }),
    { deployed: 0, rebill_total: 0 },
  );

  return { month, baseline, data, totals };
}

reportsRouter.get('/monthly-rebill', asyncHandler(async (req, res) => {
  const month = monthOrDefault(req.query.month);
  res.json(buildRebill(month));
}));

// Detail drill-down — one row per device that bills for the month at this location.
reportsRouter.get('/monthly-rebill/detail', asyncHandler(async (req, res) => {
  const month = monthOrDefault(req.query.month);
  const baseline = findBaseline(month);
  if (!baseline) return res.json({ data: [], baseline: null });

  const locParam = req.query.location_id == null ? null : String(req.query.location_id);
  const locFilter = locParam ? 'a.location_id = ?' : 'a.location_id IS NULL';
  const params = [baseline, month];
  if (locParam) params.push(locParam);

  const rows = db.prepare(`
    SELECT a.id, a.asset_tag, a.category, a.model, a.manufacturer, a.serial_number,
           asn.assigned_at as event_at, a.purchase_cost as cost,
           u.name as user_name, u.email as user_email
    FROM assignments asn
    JOIN assets a ON a.id = asn.asset_id
    JOIN asset_stock_snapshots s
      ON s.snapshot_at = ?
     AND s.asset_key = COALESCE(a.external_id, a.id)
    LEFT JOIN users u ON u.id = asn.user_id
    WHERE strftime('%Y-%m', asn.assigned_at) = ? AND a.status = 'deployed' AND ${locFilter}
    ORDER BY asn.assigned_at, a.asset_tag
  `).all(...params);

  res.json({ data: rows, baseline });
}));

// ---------- Expiring assets ----------
// Active (non-retired) assets whose warranty expires within a rolling window,
// optionally scoped to one location. We do NOT lower-bound the date, so assets
// whose warranty has already lapsed surface too (days_remaining goes negative) —
// those are the ones most overdue for action. Sorted soonest-to-expire first.
function expiringWithinDays(q) {
  const n = parseInt(String(q ?? ''), 10);
  if (!Number.isFinite(n)) return 90;
  return Math.min(3650, Math.max(1, n));
}

reportsRouter.get('/expiring-assets', asyncHandler(async (req, res) => {
  const withinDays = expiringWithinDays(req.query.within_days);
  const locationId = req.query.location_id ? String(req.query.location_id) : null;

  const where = [
    `a.warranty_expires_at IS NOT NULL`,
    `a.warranty_expires_at <= date('now', ?)`,
    `a.retired_at IS NULL`,
  ];
  const params = [`+${withinDays} days`];
  if (locationId) { where.push('a.location_id = ?'); params.push(locationId); }

  const rows = db.prepare(`
    SELECT a.id, a.asset_tag, a.category, a.model, a.manufacturer, a.serial_number,
           a.status, a.warranty_expires_at,
           l.name as location_name,
           u.name as assigned_to_name,
           CAST(julianday(a.warranty_expires_at) - julianday('now') AS INTEGER) as days_remaining
    FROM assets a
    LEFT JOIN locations l ON l.id = a.location_id
    LEFT JOIN users u ON u.id = a.assigned_to
    WHERE ${where.join(' AND ')}
    ORDER BY a.warranty_expires_at, a.asset_tag
  `).all(...params);

  res.json({ within_days: withinDays, location_id: locationId, count: rows.length, data: rows });
}));

reportsRouter.get('/license-utilization', asyncHandler(async (_req, res) => {
  const rows = db.prepare(`
    SELECT l.id, s.name as software_name, s.publisher,
           l.seats, l.seats_used, l.expires_at,
           CASE WHEN l.seats > 0 THEN ROUND(100.0 * l.seats_used / l.seats, 1) ELSE 0 END as utilization_pct,
           CASE
             WHEN l.seats_used > l.seats THEN 'overage'
             WHEN l.seats > 0 AND l.seats_used = l.seats THEN 'full'
             WHEN l.seats > 0 AND 1.0 * l.seats_used / l.seats >= 0.9 THEN 'high'
             WHEN l.seats > 0 AND 1.0 * l.seats_used / l.seats <= 0.3 THEN 'underused'
             ELSE 'ok'
           END as status
    FROM licenses l
    JOIN software s ON s.id = l.software_id
    ORDER BY utilization_pct DESC
  `).all();
  res.json({ data: rows });
}));
