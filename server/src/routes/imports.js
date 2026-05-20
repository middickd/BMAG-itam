import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { db } from '../db.js';
import { asyncHandler, id, logActivity } from '../util.js';

export const importsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

  const inserted = [];
  const errors = [];
  const insert = db.prepare(`
    INSERT INTO assets (id, asset_tag, category, model, manufacturer, serial_number, status, condition, purchase_date, purchase_cost, warranty_expires_at, notes)
    VALUES (@id, @asset_tag, @category, @model, @manufacturer, @serial_number, @status, @condition, @purchase_date, @purchase_cost, @warranty_expires_at, @notes)
  `);
  const tx = db.transaction((rows) => {
    for (const [i, r] of rows.entries()) {
      if (!r.asset_tag || !r.category || !r.model) {
        errors.push({ row: i + 2, error: 'Missing asset_tag/category/model' });
        continue;
      }
      try {
        const newId = id('ast');
        insert.run({
          id: newId,
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
        });
        inserted.push(newId);
      } catch (e) {
        errors.push({ row: i + 2, error: e.message });
      }
    }
  });
  tx(records);
  if (inserted.length) {
    logActivity({ kind: 'asset.imported', summary: `Imported ${inserted.length} assets via CSV` });
  }
  res.json({ inserted: inserted.length, errors });
}));
