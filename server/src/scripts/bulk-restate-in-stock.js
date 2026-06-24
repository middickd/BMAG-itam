// One-shot migration: flip every "In Stock" asset in Freshservice to "In Use",
// excluding the VMware VCenter VM and Hardware categories.
//
// Usage (from repo root):
//   node server/src/scripts/bulk-restate-in-stock.js                                # dry-run (default)
//   node server/src/scripts/bulk-restate-in-stock.js --apply                        # actually PUT to FS
//   node server/src/scripts/bulk-restate-in-stock.js --exclude="VMware VCenter VM"  # custom exclusion list (comma-separated)
//
// Default exclusion: "VMware VCenter VM" (VMs are virtual and shouldn't be flipped).
//
// Credentials are read from env (FRESHSERVICE_DOMAIN, FRESHSERVICE_API_KEY) or
// fall back to the app_settings rows the Integrations UI writes.
//
// Both modes write a CSV log to server/data/bulk-restate-*.csv.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FreshserviceClient } from '../freshservice.js';
import { db } from '../db.js';
import { logActivity } from '../util.js';

const DEFAULT_EXCLUDED = ['VMware VCenter VM'];

function parseExclude() {
  const arg = process.argv.find((a) => a.startsWith('--exclude='));
  if (!arg) return DEFAULT_EXCLUDED;
  return arg.slice('--exclude='.length).split(',').map((s) => s.trim()).filter(Boolean);
}

const EXCLUDED_CATEGORIES = new Set(parseExclude());
const TARGET_STATE = 'In Use';
const REQUEST_GAP_MS = 250;  // ~4 PUTs/sec — well under FS rate limits

// Match the FS-side state value the user typed as "In Stock", case-insensitive,
// allowing the common underscore variant. We use a literal-string match here
// (not the broader normalizeStatus regex from sync-freshservice.js) so we don't
// accidentally sweep in other states that normalize to in_stock (e.g. "Available").
function isInStock(value) {
  const s = String(value || '').trim().toLowerCase();
  return s === 'in stock' || s === 'in_stock' || s === 'in-stock';
}

function pickFieldValue(typeFields, candidates) {
  if (!typeFields) return null;
  for (const c of candidates) {
    if (typeFields[c] != null && typeFields[c] !== '') return typeFields[c];
    for (const k of Object.keys(typeFields)) {
      if (k === c || k.startsWith(`${c}_`)) {
        if (typeFields[k] != null && typeFields[k] !== '') return typeFields[k];
      }
    }
  }
  return null;
}

// Like pickFieldValue but returns the matching KEY (with any type-id suffix).
// PUT needs the same suffixed key the GET response uses.
function findFieldKey(typeFields, candidates) {
  if (!typeFields) return null;
  for (const c of candidates) {
    if (c in typeFields) return c;
    for (const k of Object.keys(typeFields)) {
      if (k === c || k.startsWith(`${c}_`)) return k;
    }
  }
  return null;
}

function getSetting(key) {
  try {
    return db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value || null;
  } catch {
    return null;
  }
}

function csvEsc(s) {
  const str = String(s ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const mode = apply ? 'APPLY' : 'DRY-RUN';

  const domain = process.env.FRESHSERVICE_DOMAIN || getSetting('freshservice_domain');
  const apiKey = process.env.FRESHSERVICE_API_KEY || getSetting('freshservice_api_key');
  if (!domain || !apiKey) {
    console.error('[bulk-restate] FRESHSERVICE_DOMAIN and FRESHSERVICE_API_KEY required (env or app_settings).');
    process.exit(1);
  }

  console.log(`[bulk-restate] mode=${mode} target="${TARGET_STATE}" excluded=[${[...EXCLUDED_CATEGORIES].join(', ')}]`);

  const client = new FreshserviceClient({ domain, apiKey });

  console.log('[bulk-restate] fetching asset types + assets from Freshservice…');
  const [assetTypes, assets] = await Promise.all([
    client.listAssetTypes(),
    client.listAssets(),
  ]);
  const typeById = new Map(assetTypes.map((t) => [t.id, t]));
  const categoryOf = (a) => typeById.get(a.asset_type_id)?.name || 'Hardware';

  console.log(`[bulk-restate] fetched ${assets.length} assets, ${assetTypes.length} types.`);

  const candidates = [];
  let skippedExcluded = 0;
  let skippedNoStateField = 0;
  let countsByCategory = new Map();
  for (const a of assets) {
    const tf = a.type_fields || {};
    const stateValue = pickFieldValue(tf, ['asset_state', 'state', 'status']);
    if (!isInStock(stateValue)) continue;

    const category = categoryOf(a);
    if (EXCLUDED_CATEGORIES.has(category)) {
      skippedExcluded++;
      continue;
    }

    const stateKey = findFieldKey(tf, ['asset_state', 'state', 'status']);
    if (!stateKey) {
      skippedNoStateField++;
      continue;
    }

    candidates.push({
      id: a.id,
      display_id: a.display_id,
      asset_tag: a.asset_tag || `FS-${a.id}`,
      name: a.name,
      category,
      current_state: stateValue,
      state_key: stateKey,
    });
    countsByCategory.set(category, (countsByCategory.get(category) || 0) + 1);
  }

  console.log(`[bulk-restate] candidates=${candidates.length}  (skipped: ${skippedExcluded} excluded category, ${skippedNoStateField} no state field)`);
  console.log('[bulk-restate] by category:');
  for (const [cat, n] of [...countsByCategory.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat}: ${n}`);
  }

  // Write CSV log
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.resolve(__dirname, '..', '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath = path.join(dataDir, `bulk-restate-${apply ? 'apply' : 'dryrun'}-${stamp}.csv`);
  const header = 'display_id,asset_tag,category,name,current_state,new_state,result\n';

  if (candidates.length === 0) {
    console.log('[bulk-restate] nothing to do.');
    return;
  }

  if (!apply) {
    const rows = candidates.map((c) =>
      [c.display_id, csvEsc(c.asset_tag), csvEsc(c.category), csvEsc(c.name), csvEsc(c.current_state), TARGET_STATE, 'dry-run'].join(',')
    ).join('\n');
    fs.writeFileSync(csvPath, header + rows + '\n');
    console.log(`[bulk-restate] DRY-RUN — wrote candidate list to ${csvPath}`);
    console.log('[bulk-restate] re-run with --apply to perform the update.');
    return;
  }

  // APPLY: print a 5-second warning, then PUT each candidate with throttling.
  console.log(`\n[bulk-restate] ABOUT TO PUT ${candidates.length} ASSETS to Freshservice. Ctrl-C now to abort.`);
  for (let i = 5; i > 0; i--) {
    process.stdout.write(`\r[bulk-restate] starting in ${i}s… `);
    await sleep(1000);
  }
  process.stdout.write('\n');

  let ok = 0;
  let failed = 0;
  const results = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    process.stdout.write(`[bulk-restate] (${i + 1}/${candidates.length}) PUT ${c.display_id} (${c.asset_tag})… `);
    try {
      await client.updateAsset(c.display_id, { type_fields: { [c.state_key]: TARGET_STATE } });
      ok++;
      console.log('ok');
      results.push([c.display_id, csvEsc(c.asset_tag), csvEsc(c.category), csvEsc(c.name), csvEsc(c.current_state), TARGET_STATE, 'ok'].join(','));
    } catch (e) {
      failed++;
      const msg = (e.message || 'unknown').slice(0, 240);
      console.log(`FAILED: ${msg}`);
      results.push([c.display_id, csvEsc(c.asset_tag), csvEsc(c.category), csvEsc(c.name), csvEsc(c.current_state), TARGET_STATE, `error: ${csvEsc(msg)}`].join(','));
      // If the FIRST PUT fails, that almost certainly means the state name is
      // wrong for this tenant — abort early rather than spam 200 more failures.
      if (i === 0) {
        console.error('[bulk-restate] first PUT failed; aborting to avoid cascading errors. Check the target state name in your FS tenant.');
        break;
      }
    }
    if (i < candidates.length - 1) await sleep(REQUEST_GAP_MS);
  }

  fs.writeFileSync(csvPath, header + results.join('\n') + '\n');
  console.log(`\n[bulk-restate] DONE — ok=${ok}, failed=${failed}. Log: ${csvPath}`);

  try {
    logActivity({
      kind: 'freshservice.bulk_restate',
      summary: `Bulk restate: ${ok} assets In Stock → In Use in Freshservice (${failed} failed)`,
    });
  } catch (e) {
    console.warn('[bulk-restate] could not write activity row:', e.message);
  }
}

main().catch((e) => {
  console.error('[bulk-restate] FAILED:', e);
  process.exit(1);
});
