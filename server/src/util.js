import { nanoid } from 'nanoid';
import { db } from './db.js';

export const id = (prefix = '') => `${prefix}${prefix ? '_' : ''}${nanoid(10)}`;

export function logActivity({ kind, summary, ref_type, ref_id, actor = 'system' }) {
  const actId = id('act');
  db.prepare(
    `INSERT INTO activity (id, kind, summary, ref_type, ref_id, actor) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(actId, kind, summary, ref_type || null, ref_id || null, actor);

  // Fan out to webhook subscribers. Imported lazily to avoid a circular dep.
  import('./webhooks.js').then(({ dispatchEvent }) => {
    dispatchEvent({
      id: actId,
      kind,
      summary,
      ref_type: ref_type || null,
      ref_id: ref_id || null,
      actor,
      created_at: new Date().toISOString(),
    });
  }).catch((e) => console.error('[webhook] dispatch import failed', e));
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function notFound(res, what = 'resource') {
  res.status(404).json({ error: `${what} not found` });
}

export function pickAssetUpdate(body) {
  const fields = [
    'asset_tag', 'category', 'model', 'manufacturer', 'serial_number',
    'status', 'condition', 'location_id', 'vendor_id', 'purchase_date',
    'purchase_cost', 'warranty_expires_at', 'depreciation_years', 'notes',
  ];
  const update = {};
  for (const f of fields) if (f in body) update[f] = body[f];
  return update;
}

export function depreciatedValue(asset, asOf = new Date()) {
  if (!asset.purchase_cost || !asset.purchase_date) return null;
  const years = asset.depreciation_years || 3;
  const purchased = new Date(asset.purchase_date);
  const ageYears = (asOf - purchased) / (1000 * 60 * 60 * 24 * 365.25);
  if (ageYears >= years) return 0;
  const remaining = 1 - ageYears / years;
  return Math.max(0, Math.round(asset.purchase_cost * remaining * 100) / 100);
}
