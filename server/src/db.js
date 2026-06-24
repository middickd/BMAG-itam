import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'itam.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      department TEXT,
      title TEXT,
      avatar_color TEXT,
      external_id TEXT,
      source TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      country TEXT,
      external_id TEXT,
      source TEXT NOT NULL DEFAULT 'local'
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_email TEXT,
      website TEXT
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      asset_tag TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      model TEXT NOT NULL,
      manufacturer TEXT,
      serial_number TEXT,
      status TEXT NOT NULL DEFAULT 'in_stock',
      condition TEXT DEFAULT 'good',
      location_id TEXT,
      assigned_to TEXT,
      assigned_at TEXT,
      vendor_id TEXT,
      purchase_date TEXT,
      purchase_cost REAL,
      warranty_expires_at TEXT,
      depreciation_years INTEGER DEFAULT 3,
      retired_at TEXT,
      notes TEXT,
      external_id TEXT,
      source TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (location_id) REFERENCES locations(id),
      FOREIGN KEY (assigned_to) REFERENCES users(id),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    );

    -- Backfill external_id / source on existing DBs (idempotent: errors are swallowed)
  `);

  for (const sql of [
    `ALTER TABLE users ADD COLUMN external_id TEXT`,
    `ALTER TABLE users ADD COLUMN source TEXT NOT NULL DEFAULT 'local'`,
    `ALTER TABLE locations ADD COLUMN external_id TEXT`,
    `ALTER TABLE locations ADD COLUMN source TEXT NOT NULL DEFAULT 'local'`,
    `ALTER TABLE assets ADD COLUMN external_id TEXT`,
    `ALTER TABLE assets ADD COLUMN source TEXT NOT NULL DEFAULT 'local'`,
    // Freshservice display_id (the public asset number used in PUT/DELETE URLs).
    // external_id stores the internal FS id, which the API does NOT accept in paths.
    `ALTER TABLE assets ADD COLUMN external_display_id TEXT`,
  ]) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_assets_external ON assets(external_id) WHERE external_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_users_external ON users(external_id) WHERE external_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_locations_external ON locations(external_id) WHERE external_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
    CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
    CREATE INDEX IF NOT EXISTS idx_assets_assigned_to ON assets(assigned_to);

    CREATE TABLE IF NOT EXISTS software (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      publisher TEXT,
      version TEXT,
      category TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      software_id TEXT NOT NULL,
      license_key TEXT,
      seats INTEGER NOT NULL DEFAULT 1,
      seats_used INTEGER NOT NULL DEFAULT 0,
      cost_per_seat REAL,
      billing_cycle TEXT DEFAULT 'annual',
      purchase_date TEXT,
      expires_at TEXT,
      vendor_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (software_id) REFERENCES software(id) ON DELETE CASCADE,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    );

    CREATE TABLE IF NOT EXISTS license_assignments (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT,
      FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      returned_at TEXT,
      note TEXT,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS maintenance (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      description TEXT,
      cost REAL,
      reported_by TEXT,
      assigned_tech TEXT,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (reported_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      ref_type TEXT,
      ref_id TEXT,
      actor TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '["*"]',
      secret TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_delivery_at TEXT,
      last_status INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      event_kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      status_code INTEGER,
      ok INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      response_snippet TEXT,
      latency_ms INTEGER,
      attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_hook ON webhook_deliveries(webhook_id, attempted_at DESC);

    -- Periodic snapshots of which assets are in In Stock state, used by the Monthly
    -- Rebill report to identify true "stock → in use" transitions vs. assets created
    -- directly in In Use. asset_key = COALESCE(assets.external_id, assets.id) so
    -- snapshots survive re-syncs that rotate local IDs.
    CREATE TABLE IF NOT EXISTS asset_stock_snapshots (
      snapshot_at TEXT NOT NULL,
      asset_key TEXT NOT NULL,
      PRIMARY KEY (snapshot_at, asset_key)
    );
    CREATE INDEX IF NOT EXISTS idx_stock_snapshots_at ON asset_stock_snapshots(snapshot_at);

    -- Generic key/value config store. Used today for Freshservice domain + API key
    -- so the on-demand sync button in Settings has creds to work with.
    -- Plaintext: DB file is local (server/data/itam.db) and gitignored.
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

initSchema();
