import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { db } from '../db.js';
import { asyncHandler, id, logActivity } from '../util.js';
import { FreshserviceClient } from '../freshservice.js';
import { createAssetInFreshservice } from '../freshservice-writeback.js';

export const importsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freshserviceConfig() {
  const domain = db.prepare(`SELECT value FROM app_settings WHERE key = 'freshservice_domain'`).get()?.value;
  const apiKey = db.prepare(`SELECT value FROM app_settings WHERE key = 'freshservice_api_key'`).get()?.value;
  return domain && apiKey ? { domain, apiKey } : null;
}

function rowToAsset(r) {
  return {
    asset_tag: r.asset_tag,
    category: r.category,
    model: r.model,
    manufacturer: r.manufacturer || null,
    serial_number: r.serial_number || null,
    status: r.status || 'in_stock',
    condition: r.condition || 'good',
    purchase_date: r.purchase_date || null,
    purchase_cost: r.purchase_cost ? Number(r.purchase_cost) : null,
    warranty_expires_at: r.warranty_expires_at || null,
    notes: r.notes || null,
  };
}

importsRouter.post('/assets', upload.single('file'), asyncHandler(async (req, res) => {
  let text;
  if (req.file) text = req.file.buffer.toString('utf8');
  else if (req.body?.csv) text = req.body.csv;
  else return res.status(400).json({ error: 'Provide CSV via file upload or { csv } body' });

  let records;
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid CSV: ' + e.message });
  }

  // When Freshservice is connected, each row is created there first (system of
  // record) and only persisted locally on success — otherwise the next sync would
  // wipe a local-only import. Prefetch asset types + products ONCE for the batch;
  // products created mid-batch are appended to `products` so later rows reuse them.
  const fs = freshserviceConfig();
  let assetTypes = null;
  let products = null;
  if (fs) {
    try {
      const client = new FreshserviceClient(fs);
      [assetTypes, products] = await Promise.all([
        client.listAssetTypes(),
        client.listProducts().catch(() => []),
      ]);
    } catch (e) {
      return res.status(502).json({ error: `Couldn't reach Freshservice to import: ${e.message}` });
    }
  }

  const insert = db.prepare(`
    INSERT INTO assets (id, asset_tag, category, model, manufacturer, serial_number, status, condition, purchase_date, purchase_cost, warranty_expires_at, notes, external_id, external_display_id, source)
    VALUES (@id, @asset_tag, @category, @model, @manufacturer, @serial_number, @status, @condition, @purchase_date, @purchase_cost, @warranty_expires_at, @notes, @external_id, @external_display_id, @source)
  `);

  const inserted = [];
  const errors = [];
  let pushed = 0;

  for (const [i, r] of records.entries()) {
    const rowNum = i + 2; // 1-based + header row
    const a = rowToAsset(r);
    if (!a.asset_tag || !a.category || !a.model) {
      errors.push({ row: rowNum, error: 'Missing asset_tag/category/model' });
      continue;
    }

    let external_id = null;
    let external_display_id = null;
    let source = 'local';
    if (fs) {
      try {
        const info = await createAssetInFreshservice({ ...fs, asset: a, assetTypes, products });
        external_id = info.fsId;
        external_display_id = info.displayId != null ? String(info.displayId) : null;
        source = 'freshservice';
        pushed++;
      } catch (e) {
        errors.push({ row: rowNum, asset_tag: a.asset_tag, error: `Freshservice: ${e.message}` });
        if (i < records.length - 1) await sleep(200);
        continue;
      }
    }

    try {
      const newId = id('ast');
      insert.run({ id: newId, ...a, external_id, external_display_id, source });
      inserted.push(newId);
    } catch (e) {
      errors.push({ row: rowNum, asset_tag: a.asset_tag, error: e.message });
    }
    if (fs && i < records.length - 1) await sleep(200);
  }

  if (inserted.length) {
    logActivity({
      kind: 'asset.imported',
      summary: `Imported ${inserted.length} assets via CSV${fs ? ' (pushed to Freshservice)' : ''}`,
    });
  }
  res.json({ inserted: inserted.length, errors, freshservice: fs ? { pushed } : null });
}));
