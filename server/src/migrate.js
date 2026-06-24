// Lightweight, dependency-free migration runner.
//
// Why this exists: db.js's initSchema() uses CREATE TABLE IF NOT EXISTS, which
// bootstraps a *fresh* database but can't evolve an *existing* one (it never adds
// a column to a table that already exists). Once the app is deployed with real
// data — stock snapshots that back the Rebill report, integration credentials,
// webhooks, local-only edits — none of which survive a reset+reseed — schema
// changes must happen in place. That's what migrations do.
//
// Model:
//   - initSchema() (db.js) defines the BASELINE: the schema as it stands today.
//     A brand-new DB gets every current table from it. There are intentionally no
//     migration files describing the current schema.
//   - Every schema change FROM HERE FORWARD is a new file in ./migrations/, applied
//     once, in filename order, and recorded in the schema_migrations ledger.
//
// Migration files (./migrations/), applied in lexicographic order — name them with
// a zero-padded prefix so order is stable: `0001-add-foo-to-assets.sql`.
//   - `*.sql` : run verbatim via db.exec() (may contain multiple statements).
//   - `*.js`  : ESM module whose default export is `(db) => { ... }`. Use this when
//               a change needs logic — conditional ALTERs, data backfills, etc.
// Each file runs inside a transaction together with its ledger insert, so a failure
// rolls back both the change and the record — the migration stays "pending" and the
// app fails loud rather than half-applying.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { db as defaultDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function ensureLedger(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function pendingFiles(db) {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((r) => r.id),
  );
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') || f.endsWith('.js'))
    .sort()
    .filter((f) => !applied.has(f));
}

// Apply all pending migrations. Idempotent: running again with nothing pending is a
// no-op. `db` is injectable for tests; defaults to the app's shared connection.
export async function runMigrations(db = defaultDb, { log = console.log } = {}) {
  ensureLedger(db);
  const pending = pendingFiles(db);
  if (pending.length === 0) {
    log('[migrate] up to date — no pending migrations');
    return { applied: [] };
  }

  log(`[migrate] ${pending.length} pending: ${pending.join(', ')}`);
  const record = db.prepare('INSERT INTO schema_migrations (id) VALUES (?)');

  for (const file of pending) {
    const full = path.join(MIGRATIONS_DIR, file);

    // Load the migration's effect as a function we can run inside a transaction.
    let apply;
    if (file.endsWith('.sql')) {
      const sql = fs.readFileSync(full, 'utf8');
      apply = (database) => database.exec(sql);
    } else {
      // Dynamic import needs a file:// URL on Windows.
      const mod = await import(pathToFileURL(full).href);
      const fn = mod.default || mod.up;
      if (typeof fn !== 'function') {
        throw new Error(`[migrate] ${file}: .js migration must default-export a function (db) => {…}`);
      }
      apply = fn;
    }

    try {
      db.transaction(() => {
        apply(db);
        record.run(file);
      })();
      log(`[migrate]   applied ${file}`);
    } catch (err) {
      log(`[migrate]   FAILED ${file}: ${err.message}`);
      throw err; // stop the run; this migration stays pending
    }
  }

  log(`[migrate] done — applied ${pending.length}`);
  return { applied: pending };
}

// CLI entrypoint: `node src/migrate.js` (and the `npm run migrate` script).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
