// One-shot sync from Freshservice → our SQLite DB.
//
// Usage:
//   FRESHSERVICE_DOMAIN=company.freshservice.com FRESHSERVICE_API_KEY=... \
//     node server/src/sync-freshservice.js [--dry-run]
//
// Behavior: wipes our existing assets/users/locations and replaces them with
// what Freshservice returns. Assignments/maintenance/activity rows whose
// referenced asset survived (by external_id) are preserved; otherwise they
// cascade out via the FK ON DELETE CASCADE on those tables.

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initSchema } from './db.js';
import { FreshserviceClient } from './freshservice.js';
import { id, logActivity } from './util.js';

// ----- Status mapping -----
// Freshservice ships with these states by default but customers can rename them.
// We normalize on lowercase substring matches so common variants ("In Use", "In-Use",
// "Deployed") all collapse to our enum.
const STATUS_RULES = [
  { match: /retire|disposed|decommission/, status: 'retired' },
  { match: /lost|stolen|missing/,           status: 'lost' },
  { match: /repair|maint|service/,          status: 'maintenance' },
  { match: /reserved|loaner|loan/,          status: 'reserved' },
  { match: /use|deploy|active|assigned/,    status: 'deployed' },
  { match: /stock|available|inventory|new/, status: 'in_stock' },
];
function normalizeStatus(s) {
  if (!s) return 'in_stock';
  const lower = String(s).toLowerCase();
  for (const r of STATUS_RULES) if (r.match.test(lower)) return r.status;
  return 'in_stock';
}

// ----- Type field extraction -----
// FS appends the asset_type_id to custom field names (e.g. `serial_number_27`).
// We probe a list of candidate keys and return the first non-empty value.
function pickField(typeFields, candidates) {
  if (!typeFields) return null;
  for (const c of candidates) {
    if (typeFields[c] != null && typeFields[c] !== '') return typeFields[c];
    // try suffixed variants
    for (const k of Object.keys(typeFields)) {
      if (k === c || k.startsWith(`${c}_`)) {
        if (typeFields[k] != null && typeFields[k] !== '') return typeFields[k];
      }
    }
  }
  return null;
}

// Core sync logic, callable from both the CLI script and the Settings UI button.
// Returns a summary object; if dryRun=true, returns sample mapped rows + coverage stats
// without touching the DB.
export async function runSync({ domain, apiKey, dryRun = false, log = console.log }) {
  if (!domain || !apiKey) {
    throw new Error('Freshservice domain and API key required');
  }

  initSchema();
  const fs = new FreshserviceClient({ domain, apiKey });
  log(`[sync] Connecting to ${domain}...`);

  const [assetTypes, locations, requesters, agents, products, vendors, assets] = await Promise.all([
    fs.listAssetTypes(),
    fs.listLocations(),
    fs.listRequesters(),
    fs.listAgents(),
    fs.listProducts().catch(() => []),
    fs.listVendors().catch(() => []),
    fs.listAssets(),
  ]);

  log(`[sync] Fetched: ${assets.length} assets, ${requesters.length} requesters, ` +
      `${agents.length} agents, ${locations.length} locations, ` +
      `${products.length} products, ${vendors.length} vendors, ${assetTypes.length} asset types`);

  const typeById = new Map(assetTypes.map((t) => [t.id, t]));
  function categoryFor(typeId) {
    const cur = typeById.get(typeId);
    return cur?.name || 'Hardware';
  }

  const productById = new Map(products.map((p) => [p.id, p]));
  const vendorById  = new Map(vendors.map((v) => [v.id, v]));
  const ctx = { categoryFor, productById, vendorById };

  if (dryRun) {
    log('[sync] DRY RUN — sampling output without touching the DB.');
    const allMapped = assets.map((a) => mapAsset(a, ctx));
    return {
      dryRun: true,
      counts: {
        assets: assets.length, requesters: requesters.length, agents: agents.length,
        locations: locations.length, products: products.length, vendors: vendors.length,
      },
      sample: {
        assets: allMapped.slice(0, 5),
        users:  [...requesters.slice(0, 2), ...agents.slice(0, 1)].map(mapUser),
        locations: locations.slice(0, 3).map(mapLocation),
      },
      coverage: {
        total: allMapped.length,
        with_model_from_product: allMapped.filter((a) => a.model_source === 'product').length,
        with_manufacturer: allMapped.filter((a) => a.manufacturer).length,
        with_serial: allMapped.filter((a) => a.serial_number).length,
        with_purchase_cost: allMapped.filter((a) => a.purchase_cost).length,
      },
    };
  }

  const tx = db.transaction(() => {
    db.exec(`
      DELETE FROM assignments;
      DELETE FROM maintenance;
      DELETE FROM license_assignments;
      DELETE FROM assets;
      DELETE FROM users;
      DELETE FROM locations;
    `);

    const locStmt = db.prepare(`
      INSERT INTO locations (id, name, address, city, country, external_id, source)
      VALUES (?, ?, ?, ?, ?, ?, 'freshservice')
    `);
    const locByExt = new Map();
    for (const l of locations) {
      const mapped = mapLocation(l);
      const newId = id('loc');
      locStmt.run(newId, mapped.name, mapped.address, mapped.city, mapped.country, mapped.external_id);
      locByExt.set(mapped.external_id, newId);
    }

    const userStmt = db.prepare(`
      INSERT OR REPLACE INTO users (id, email, name, role, department, title, external_id, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'freshservice')
    `);
    const userByExt = new Map();
    for (const r of requesters) {
      const mapped = mapUser(r, 'user');
      if (!mapped.email) continue;
      const newId = id('usr');
      userStmt.run(newId, mapped.email, mapped.name, 'user', mapped.department, mapped.title, mapped.external_id);
      userByExt.set(mapped.external_id, newId);
    }
    for (const a of agents) {
      const mapped = mapUser(a, 'admin');
      if (!mapped.email) continue;
      const newId = id('usr');
      userStmt.run(newId, mapped.email, mapped.name, 'admin', mapped.department, mapped.title, mapped.external_id);
      userByExt.set(mapped.external_id, newId);
    }

    const assetStmt = db.prepare(`
      INSERT INTO assets (
        id, asset_tag, category, model, manufacturer, serial_number, status,
        location_id, assigned_to, assigned_at, purchase_date, purchase_cost,
        warranty_expires_at, notes, external_id, external_display_id, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'freshservice')
    `);
    let assignmentCount = 0;
    let dedupedCount = 0;
    const asnStmt = db.prepare(
      'INSERT INTO assignments (id, asset_id, user_id, assigned_at) VALUES (?, ?, ?, ?)'
    );
    const seenTags = new Set();
    for (const a of assets) {
      const m = mapAsset(a, ctx);
      let tag = m.asset_tag;
      if (seenTags.has(tag)) {
        tag = `${tag}-${m.external_id}`;
        dedupedCount++;
      }
      seenTags.add(tag);

      const newId = id('ast');
      const locationId = m.fs_location_id ? locByExt.get(m.fs_location_id) || null : null;
      const assignedTo = m.fs_user_id ? userByExt.get(m.fs_user_id) || null : null;
      assetStmt.run(
        newId, tag, m.category, m.model, m.manufacturer, m.serial_number,
        m.status, locationId, assignedTo, m.assigned_at, m.purchase_date,
        m.purchase_cost, m.warranty_expires_at, m.notes, m.external_id,
        m.external_display_id,
      );
      if (assignedTo) {
        asnStmt.run(id('asn'), newId, assignedTo, m.assigned_at || new Date().toISOString());
        assignmentCount++;
      }
    }

    logActivity({
      kind: 'sync.freshservice',
      summary: `Synced from Freshservice: ${assets.length} assets, ${requesters.length + agents.length} users, ${locations.length} locations`,
    });

    const snapshotAt = new Date().toISOString();
    const snapped = db.prepare(`
      INSERT INTO asset_stock_snapshots (snapshot_at, asset_key)
      SELECT ?, COALESCE(external_id, id) FROM assets WHERE status = 'in_stock'
    `).run(snapshotAt);
    // Materialize the snapshot even when In Stock is 0 — gives Rebill a baseline anchor.
    // Sentinel '__empty__' is filtered from the snapshot LIST + member endpoints in routes/reports.js.
    if (snapped.changes === 0) {
      db.prepare('INSERT INTO asset_stock_snapshots (snapshot_at, asset_key) VALUES (?, ?)')
        .run(snapshotAt, '__empty__');
    }

    return { assignmentCount, dedupedCount, snapshotAt, snappedCount: snapped.changes };
  });

  const result = tx();
  log(`[sync] Wrote ${assets.length} assets, ${requesters.length + agents.length} users, ` +
      `${locations.length} locations. ${result.assignmentCount} active assignments.`);
  log(`[sync] Snapshot ${result.snapshotAt}: ${result.snappedCount} assets In Stock`);

  return {
    dryRun: false,
    counts: {
      assets: assets.length,
      users: requesters.length + agents.length,
      locations: locations.length,
      assignments: result.assignmentCount,
      deduped_tags: result.dedupedCount,
    },
    snapshot: { at: result.snapshotAt, in_stock_count: result.snappedCount },
  };
}

// Incremental, NON-destructive sync. Pulls only assets whose Freshservice id we
// don't already have locally and inserts them; existing assets, users, locations,
// assignments, maintenance, and local edits are left completely untouched. New
// assets' referenced location/user are materialized on demand if missing.
//
// Freshservice's asset list has no reliable "created since" server filter, so we
// fetch the list and diff against our existing external_ids in-process. The win is
// not network volume — it's that nothing is wiped or rewritten. Deliberately does
// NOT take a stock snapshot: a soft sync sees only new rows, not the full in-stock
// state, so snapshotting from it would record a misleading baseline. Run a full
// sync (or POST /api/reports/take-snapshot) when you need a fresh baseline.
export async function runSoftSync({ domain, apiKey, log = console.log }) {
  if (!domain || !apiKey) {
    throw new Error('Freshservice domain and API key required');
  }

  initSchema();
  const fs = new FreshserviceClient({ domain, apiKey });
  log(`[soft-sync] Connecting to ${domain}...`);

  const [assetTypes, locations, requesters, agents, products, vendors, assets] = await Promise.all([
    fs.listAssetTypes(),
    fs.listLocations(),
    fs.listRequesters(),
    fs.listAgents(),
    fs.listProducts().catch(() => []),
    fs.listVendors().catch(() => []),
    fs.listAssets(),
  ]);

  const typeById = new Map(assetTypes.map((t) => [t.id, t]));
  const categoryFor = (typeId) => typeById.get(typeId)?.name || 'Hardware';
  const ctx = {
    categoryFor,
    productById: new Map(products.map((p) => [p.id, p])),
    vendorById: new Map(vendors.map((v) => [v.id, v])),
  };

  // Existing local rows keyed by their Freshservice external_id (and email for users,
  // to avoid a UNIQUE(email) collision when FS rotated an id for the same person).
  const locByExt = new Map(
    db.prepare(`SELECT external_id, id FROM locations WHERE external_id IS NOT NULL`).all().map((r) => [r.external_id, r.id]),
  );
  const userByExt = new Map(
    db.prepare(`SELECT external_id, id FROM users WHERE external_id IS NOT NULL`).all().map((r) => [r.external_id, r.id]),
  );
  const userIdByEmail = new Map(
    db.prepare(`SELECT email, id FROM users`).all().map((r) => [r.email, r.id]),
  );
  const existingAssetExt = new Set(
    db.prepare(`SELECT external_id FROM assets WHERE external_id IS NOT NULL`).all().map((r) => r.external_id),
  );
  const seenTags = new Set(db.prepare(`SELECT asset_tag FROM assets`).all().map((r) => r.asset_tag));

  // FS source rows, so we can materialize a referenced location/user that isn't local yet.
  const fsLocById = new Map(locations.map((l) => [String(l.id), l]));
  const fsUserById = new Map();
  const fsUserRole = new Map();
  for (const r of requesters) { fsUserById.set(String(r.id), r); fsUserRole.set(String(r.id), 'user'); }
  for (const a of agents)     { fsUserById.set(String(a.id), a); fsUserRole.set(String(a.id), 'admin'); }

  const newAssets = assets.filter((a) => !existingAssetExt.has(String(a.id)));
  log(`[soft-sync] ${assets.length} assets in Freshservice, ${newAssets.length} new since last sync`);

  const counts = { scanned: assets.length, new_assets: 0, new_users: 0, new_locations: 0, assignments: 0, deduped: 0 };

  const locStmt = db.prepare(`
    INSERT INTO locations (id, name, address, city, country, external_id, source)
    VALUES (?, ?, ?, ?, ?, ?, 'freshservice')
  `);
  const userStmt = db.prepare(`
    INSERT INTO users (id, email, name, role, department, title, external_id, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'freshservice')
  `);
  const assetStmt = db.prepare(`
    INSERT INTO assets (
      id, asset_tag, category, model, manufacturer, serial_number, status,
      location_id, assigned_to, assigned_at, purchase_date, purchase_cost,
      warranty_expires_at, notes, external_id, external_display_id, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'freshservice')
  `);
  const asnStmt = db.prepare('INSERT INTO assignments (id, asset_id, user_id, assigned_at) VALUES (?, ?, ?, ?)');

  const ensureLocation = (extId) => {
    if (!extId) return null;
    if (locByExt.has(extId)) return locByExt.get(extId);
    const src = fsLocById.get(extId);
    if (!src) return null;
    const mapped = mapLocation(src);
    const newId = id('loc');
    locStmt.run(newId, mapped.name, mapped.address, mapped.city, mapped.country, mapped.external_id);
    locByExt.set(extId, newId);
    counts.new_locations++;
    return newId;
  };
  const ensureUser = (extId) => {
    if (!extId) return null;
    if (userByExt.has(extId)) return userByExt.get(extId);
    const src = fsUserById.get(extId);
    if (!src) return null;
    const mapped = mapUser(src);
    if (!mapped.email) return null;
    // Same person, new FS id: reuse the existing local user rather than collide on email.
    if (userIdByEmail.has(mapped.email)) {
      const existingId = userIdByEmail.get(mapped.email);
      userByExt.set(extId, existingId);
      return existingId;
    }
    const newId = id('usr');
    userStmt.run(newId, mapped.email, mapped.name, fsUserRole.get(extId) || 'user', mapped.department, mapped.title, mapped.external_id);
    userByExt.set(extId, newId);
    userIdByEmail.set(mapped.email, newId);
    counts.new_users++;
    return newId;
  };

  const tx = db.transaction(() => {
    for (const a of newAssets) {
      const m = mapAsset(a, ctx);
      let tag = m.asset_tag;
      if (seenTags.has(tag)) { tag = `${tag}-${m.external_id}`; counts.deduped++; }
      seenTags.add(tag);

      const newId = id('ast');
      const locationId = ensureLocation(m.fs_location_id);
      const assignedTo = ensureUser(m.fs_user_id);
      assetStmt.run(
        newId, tag, m.category, m.model, m.manufacturer, m.serial_number,
        m.status, locationId, assignedTo, m.assigned_at, m.purchase_date,
        m.purchase_cost, m.warranty_expires_at, m.notes, m.external_id,
        m.external_display_id,
      );
      counts.new_assets++;
      if (assignedTo) {
        asnStmt.run(id('asn'), newId, assignedTo, m.assigned_at || new Date().toISOString());
        counts.assignments++;
      }
    }

    logActivity({
      kind: 'sync.freshservice',
      summary: counts.new_assets > 0
        ? `Soft sync from Freshservice: +${counts.new_assets} new assets, +${counts.new_users} users, +${counts.new_locations} locations`
        : `Soft sync from Freshservice: no new assets (scanned ${counts.scanned})`,
    });
  });

  tx();
  log(`[soft-sync] Added ${counts.new_assets} assets, ${counts.new_users} users, ${counts.new_locations} locations. ${counts.assignments} assignments.`);

  return { dryRun: false, mode: 'soft', counts };
}

async function main() {
  const soft = process.argv.includes('--soft');
  const runner = soft ? runSoftSync : runSync;
  await runner({
    domain: process.env.FRESHSERVICE_DOMAIN,
    apiKey: process.env.FRESHSERVICE_API_KEY,
    dryRun: !soft && process.argv.includes('--dry-run'),
  });
}

// ----- Mappers (pure, exported for testing) -----
export function mapLocation(l) {
  return {
    external_id: String(l.id),
    name: l.name || 'Location',
    address: l.address?.line1 || l.address?.street || null,
    city: l.address?.city || l.city || null,
    country: l.address?.country || l.country || null,
  };
}

export function mapUser(u, _role = 'user') {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.name || u.email || 'Unknown';
  const dept = Array.isArray(u.department_names) ? u.department_names[0] : u.department_name || null;
  return {
    external_id: String(u.id),
    email: (u.email || u.primary_email || '').toLowerCase(),
    name,
    department: dept,
    title: u.job_title || null,
  };
}

export function mapAsset(a, ctx) {
  // ctx: { categoryFor, productById, vendorById }
  const tf = a.type_fields || {};

  // Resolve product reference: FS asset.type_fields.product_<typeid> holds a Product ID.
  // The Product record carries the real model name and OEM manufacturer string.
  const productRef = pickField(tf, ['product']);
  const product = productRef && ctx.productById ? ctx.productById.get(productRef) : null;

  // Resolve vendor reference (seller, not manufacturer — we only use this as a manufacturer fallback).
  const vendorRef = pickField(tf, ['vendor']);
  const vendor = vendorRef && ctx.vendorById ? ctx.vendorById.get(vendorRef) : null;

  // The FS asset "name" is often the serial number for orgs that scan a serial when receiving.
  // Prefer the resolved Product.name if we have one.
  let model;
  let model_source;
  if (product?.name) {
    model = product.name;
    model_source = 'product';
  } else if (a.name) {
    model = a.name;
    model_source = 'asset_name';
  } else {
    model = pickField(tf, ['model']) || 'Untitled';
    model_source = 'fallback';
  }

  const manufacturer =
    product?.manufacturer ||
    pickField(tf, ['manufacturer']) ||
    vendor?.name ||
    null;

  // BMAG scans the unit serial / Dell service tag into the FS asset *Name* on receiving,
  // and only rarely fills a serial_number custom field. Since the model now always comes
  // from the resolved Product (model_source === 'product'), a.name is free to use as the
  // serial. Prefer an explicit serial field if present, then fall back to the Name —
  // but only when it looks like a serial (no whitespace), to skip descriptive names
  // like "WiFi Hot Spot".
  let serial = pickField(tf, ['serial_number', 'service_tag', 'serial']) || null;
  if (!serial && model_source === 'product' && a.name) {
    const n = String(a.name).trim();
    if (n && !/\s/.test(n) && n.length <= 32) serial = n;
  }

  return {
    external_id: String(a.id),
    external_display_id: a.display_id != null ? String(a.display_id) : null,
    asset_tag: a.asset_tag || a.display_id || `FS-${a.id}`,
    category: ctx.categoryFor(a.asset_type_id),
    model,
    model_source,
    manufacturer,
    serial_number: serial,
    status: normalizeStatus(pickField(tf, ['asset_state', 'state', 'status']) || a.usage_type),
    fs_location_id: a.location_id ? String(a.location_id) : null,
    fs_user_id: a.user_id ? String(a.user_id) : (a.agent_id ? String(a.agent_id) : null),
    assigned_at: a.assigned_on || null,
    purchase_date: pickField(tf, ['acquisition_date', 'purchase_date']) || null,
    purchase_cost: Number(pickField(tf, ['cost'])) || null,
    warranty_expires_at: pickField(tf, ['warranty_expiry_date', 'warranty_end_date']) || null,
    notes: a.description || null,
  };
}

// Run main() when invoked directly. Cross-platform check via realpath comparison.
const thisFile = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (path.resolve(thisFile) === invoked) {
  main().catch((e) => {
    console.error('[sync] FAILED:', e.message);
    process.exit(1);
  });
}
