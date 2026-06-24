import { Router } from 'express';
import { stringify } from 'csv-stringify/sync';
import { db } from '../db.js';
import { asyncHandler } from '../util.js';

export const exportsRouter = Router();

// Sentinel asset_key used by reports.js to materialize an empty (0 in-stock)
// snapshot. Mirror it here so as-of exports never surface the tombstone row.
const EMPTY_SNAPSHOT_MARKER = '__empty__';

// Columns shared by the live and as-of inventory exports so both produce an
// identical CSV shape.
const INVENTORY_SELECT = `
  a.asset_tag, a.category, a.model, a.manufacturer, a.serial_number,
  a.status, a.condition, l.name as location, u.name as assigned_to,
  u.email as assigned_email, a.purchase_date, a.purchase_cost,
  a.warranty_expires_at, a.notes
`;

exportsRouter.get('/assets.csv', asyncHandler(async (req, res) => {
  const { status, category } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('a.status = ?'); params.push(status); }
  if (category) { where.push('a.category = ?'); params.push(category); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT ${INVENTORY_SELECT}
    FROM assets a
    LEFT JOIN locations l ON l.id = a.location_id
    LEFT JOIN users u ON u.id = a.assigned_to
    ${whereSql}
    ORDER BY a.asset_tag
  `).all(...params);
  const csv = stringify(rows, { header: true });
  const filename = status ? `assets-${status}.csv` : 'assets.csv';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

// Inventory as of a specific date. There is no per-asset history table, so we
// reconstruct "what was In Stock then" from the nearest stock snapshot taken on
// or before that date (same baseline rule the Monthly Rebill report uses), then
// join those asset keys back to current asset detail for the report columns.
// Without ?asOf this falls through to the live In Stock list (identical shape to
// /assets.csv?status=in_stock) so the same endpoint backs both cases.
function inventoryBaseline(asOfIso) {
  const row = db.prepare(`
    SELECT MAX(snapshot_at) AS at
    FROM asset_stock_snapshots
    WHERE snapshot_at <= ?
  `).get(asOfIso);
  return row?.at || null;
}

exportsRouter.get('/inventory.csv', asyncHandler(async (req, res) => {
  const asOf = String(req.query.asOf || '').trim();

  // No date → live In Stock inventory.
  if (!asOf) {
    const rows = db.prepare(`
      SELECT ${INVENTORY_SELECT}
      FROM assets a
      LEFT JOIN locations l ON l.id = a.location_id
      LEFT JOIN users u ON u.id = a.assigned_to
      WHERE a.status = 'in_stock'
      ORDER BY a.asset_tag
    `).all();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory.csv"');
    return res.send(stringify(rows, { header: true }));
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return res.status(400).json({ error: 'asOf must be a YYYY-MM-DD date' });
  }

  // Treat the chosen date inclusively: the latest snapshot at any time that day
  // (or earlier) is the baseline.
  const baseline = inventoryBaseline(`${asOf}T23:59:59.999Z`);
  const rows = baseline ? db.prepare(`
    SELECT ${INVENTORY_SELECT}
    FROM asset_stock_snapshots s
    JOIN assets a ON COALESCE(a.external_id, a.id) = s.asset_key
    LEFT JOIN locations l ON l.id = a.location_id
    LEFT JOIN users u ON u.id = a.assigned_to
    WHERE s.snapshot_at = ? AND s.asset_key != ?
    ORDER BY a.asset_tag
  `).all(baseline, EMPTY_SNAPSHOT_MARKER) : [];

  // Surface the snapshot actually used so the client can tell the user how close
  // it was to the requested date (snapshots are periodic, not daily).
  res.setHeader('X-Inventory-Baseline', baseline || 'none');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="inventory-as-of-${asOf}.csv"`);
  res.send(stringify(rows, { header: true }));
}));

// Monthly rebill — devices that transitioned In Stock → In Use during the month,
// determined by joining the in-month assignments against the in-stock baseline
// snapshot taken at or before the first day of the month.
function rebillMonth(raw) {
  return /^\d{4}-\d{2}$/.test(raw || '')
    ? raw
    : (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
}

function findRebillBaseline(month) {
  const row = db.prepare(`
    SELECT MAX(snapshot_at) AS at
    FROM asset_stock_snapshots
    WHERE snapshot_at <= ?
  `).get(`${month}-01T23:59:59Z`);
  return row?.at || null;
}

exportsRouter.get('/monthly-rebill.csv', asyncHandler(async (req, res) => {
  const month = rebillMonth(req.query.month);
  const baseline = findRebillBaseline(month);

  const rows = baseline ? db.prepare(`
    SELECT
      COALESCE(l.name, '(Unassigned)') as Location,
      COUNT(*) as Deployed,
      COALESCE(SUM(a.purchase_cost), 0) as RebillTotal
    FROM assignments asn
    JOIN assets a ON a.id = asn.asset_id
    JOIN asset_stock_snapshots s
      ON s.snapshot_at = ?
     AND s.asset_key = COALESCE(a.external_id, a.id)
    LEFT JOIN locations l ON l.id = a.location_id
    WHERE strftime('%Y-%m', asn.assigned_at) = ?
    GROUP BY a.location_id
    ORDER BY Location
  `).all(baseline, month) : [];

  const totals = rows.reduce(
    (acc, r) => ({
      Location: 'TOTAL',
      Deployed: acc.Deployed + r.Deployed,
      RebillTotal: Math.round((acc.RebillTotal + r.RebillTotal) * 100) / 100,
    }),
    { Location: 'TOTAL', Deployed: 0, RebillTotal: 0 },
  );
  rows.push(totals);

  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="monthly-rebill-${month}.csv"`);
  res.send(csv);
}));

// One row per device that transitioned from stock in the month.
exportsRouter.get('/monthly-rebill-detail.csv', asyncHandler(async (req, res) => {
  const month = rebillMonth(req.query.month);
  const baseline = findRebillBaseline(month);

  const rows = baseline ? db.prepare(`
    SELECT
      COALESCE(l.name, '(Unassigned)') as Location,
      a.asset_tag    as AssetTag,
      a.category     as Category,
      a.manufacturer as Manufacturer,
      a.model        as Model,
      a.serial_number as SerialNumber,
      u.name         as AssignedTo,
      u.email        as AssignedEmail,
      asn.assigned_at as DeployedAt,
      COALESCE(a.purchase_cost, 0) as Cost
    FROM assignments asn
    JOIN assets a ON a.id = asn.asset_id
    JOIN asset_stock_snapshots s
      ON s.snapshot_at = ?
     AND s.asset_key = COALESCE(a.external_id, a.id)
    LEFT JOIN locations l ON l.id = a.location_id
    LEFT JOIN users u ON u.id = asn.user_id
    WHERE strftime('%Y-%m', asn.assigned_at) = ?
    ORDER BY Location, asn.assigned_at, a.asset_tag
  `).all(baseline, month) : [];

  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="monthly-rebill-detail-${month}.csv"`);
  res.send(csv);
}));

// Active assets whose warranty expires within a rolling window, optionally scoped
// to one location. Mirrors the /reports/expiring-assets endpoint (no lower bound,
// so already-lapsed warranties surface with a negative DaysRemaining).
exportsRouter.get('/expiring-assets.csv', asyncHandler(async (req, res) => {
  const n = parseInt(String(req.query.within_days ?? ''), 10);
  const withinDays = Number.isFinite(n) ? Math.min(3650, Math.max(1, n)) : 90;
  const locationId = req.query.location_id ? String(req.query.location_id) : null;

  const where = [
    `a.warranty_expires_at IS NOT NULL`,
    `a.warranty_expires_at <= date('now', ?)`,
    `a.retired_at IS NULL`,
  ];
  const params = [`+${withinDays} days`];
  if (locationId) { where.push('a.location_id = ?'); params.push(locationId); }

  const rows = db.prepare(`
    SELECT a.asset_tag      as AssetTag,
           a.category       as Category,
           a.manufacturer   as Manufacturer,
           a.model          as Model,
           a.serial_number  as SerialNumber,
           a.status         as Status,
           COALESCE(l.name, '(No location)') as Location,
           u.name           as AssignedTo,
           a.warranty_expires_at as WarrantyExpires,
           CAST(julianday(a.warranty_expires_at) - julianday('now') AS INTEGER) as DaysRemaining
    FROM assets a
    LEFT JOIN locations l ON l.id = a.location_id
    LEFT JOIN users u ON u.id = a.assigned_to
    WHERE ${where.join(' AND ')}
    ORDER BY a.warranty_expires_at, a.asset_tag
  `).all(...params);

  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="expiring-assets.csv"');
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
