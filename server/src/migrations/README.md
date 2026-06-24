# Schema migrations

Incremental schema changes applied by `../migrate.js`. **The current schema is the
baseline** — defined by `initSchema()` in `db.js`, not by any file here. Only changes
*from now forward* go in this folder.

## Adding a migration

1. Create a file with the next zero-padded number: `0001-short-description.sql`
   (or `.js`). Files apply in lexicographic order, so the prefix fixes ordering.
2. Write the change. **Make it forward-only and self-contained** — it runs exactly
   once and is then recorded in the `schema_migrations` ledger.
3. It applies automatically on the next server start (and in CI before restart);
   run it locally on demand with `npm run migrate` from the repo root.

## SQL migration (most changes)

```sql
-- 0001-add-replacement-cost-to-assets.sql
ALTER TABLE assets ADD COLUMN replacement_cost REAL;
```

## JS migration (when you need logic or a data backfill)

```js
// 0002-backfill-replacement-cost.js
export default function up(db) {
  const rows = db.prepare('SELECT id, purchase_cost FROM assets WHERE replacement_cost IS NULL').all();
  const set = db.prepare('UPDATE assets SET replacement_cost = ? WHERE id = ?');
  for (const r of rows) set.run(r.purchase_cost, r.id);
}
```

## Notes

- Each migration runs inside a transaction together with its ledger insert. If it
  throws, both roll back — it stays pending and the app fails loudly rather than
  half-applying. Fix the migration and restart.
- SQLite's `ALTER TABLE` is limited (no DROP/ALTER COLUMN). To reshape a table, use
  the create-new → copy → drop → rename dance inside a single `.sql` file.
- Never edit or renumber a migration that has already run anywhere (your machine or
  prod). Write a new one instead — the ledger keys on the filename.
