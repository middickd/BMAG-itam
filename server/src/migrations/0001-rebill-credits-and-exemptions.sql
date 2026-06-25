-- Rebill crediting: two complementary mechanisms.
--
-- 1) Per-deployment exemption. A warranty RMA swap looks like a brand-new
--    stock→deployed transition (replacement pulled from stock) but costs the
--    location nothing — the defective unit went back to the vendor. Flag that
--    specific assignment so it drops from the rebill count and total. The
--    exemption travels with the deployment event, so a later reassignment of the
--    same asset is unaffected, and because rebills are computed live it applies
--    retroactively to any month that re-runs.
ALTER TABLE assignments ADD COLUMN rebill_exempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assignments ADD COLUMN rebill_exempt_reason TEXT;

-- 2) Free-form per-location monthly credits. For adjustments that don't map 1:1
--    to a billable deployment in the month — goodwill, disputes, partial credits,
--    or correcting a prior month that has no current deployment to exempt. Stored
--    as a positive dollar amount subtracted from that location's rebill total.
--    asset_id is an optional reference for context only (no FK: assets get their
--    local ids rotated on Freshservice re-sync, and a credit should outlive that).
CREATE TABLE IF NOT EXISTS rebill_credits (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,            -- YYYY-MM the credit applies to
  location_id TEXT,              -- NULL = the (Unassigned) bucket
  amount REAL NOT NULL,         -- positive dollars subtracted from the location's rebill
  reason TEXT,
  asset_id TEXT,               -- optional, for context (no FK by design)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT,
  FOREIGN KEY (location_id) REFERENCES locations(id)
);
CREATE INDEX IF NOT EXISTS idx_rebill_credits_month ON rebill_credits(month);
