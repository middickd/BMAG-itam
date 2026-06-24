import { Router } from 'express';
import { db } from '../db.js';
import { asyncHandler, id, logActivity, notFound } from '../util.js';
import { deliverOnce } from '../webhooks.js';

export const webhooksRouter = Router();

function shape(row) {
  if (!row) return row;
  let events = ['*'];
  try { events = JSON.parse(row.events); } catch { /* fall through */ }
  return {
    id: row.id,
    url: row.url,
    events,
    secret: row.secret ? '****' : null,
    created_at: row.created_at,
    last_delivery_at: row.last_delivery_at,
    last_status: row.last_status,
    enabled: !!row.enabled,
  };
}

webhooksRouter.get('/', (_req, res) => {
  const rows = db.prepare(`SELECT * FROM webhooks ORDER BY created_at DESC`).all();
  res.json({ data: rows.map(shape) });
});

webhooksRouter.post('/', asyncHandler(async (req, res) => {
  const { url, events = ['*'], secret } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  const eventsArr = Array.isArray(events) ? events : ['*'];
  const newId = id('wh');
  db.prepare(`
    INSERT INTO webhooks (id, url, events, secret) VALUES (?, ?, ?, ?)
  `).run(newId, url, JSON.stringify(eventsArr), secret || null);
  logActivity({ kind: 'webhook.created', summary: `Webhook registered: ${url}`, ref_type: 'webhook', ref_id: newId });
  const row = db.prepare(`SELECT * FROM webhooks WHERE id=?`).get(newId);
  res.status(201).json(shape(row));
}));

webhooksRouter.delete('/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM webhooks WHERE id=?`).get(req.params.id);
  if (!row) return notFound(res, 'Webhook');
  db.prepare(`DELETE FROM webhooks WHERE id=?`).run(req.params.id);
  logActivity({ kind: 'webhook.deleted', summary: `Webhook removed: ${row.url}`, ref_type: 'webhook', ref_id: row.id });
  res.status(204).end();
});

webhooksRouter.get('/:id/deliveries', asyncHandler(async (req, res) => {
  const rows = db.prepare(`
    SELECT id, event_kind, status_code, ok, error, response_snippet, latency_ms, attempted_at
    FROM webhook_deliveries
    WHERE webhook_id = ?
    ORDER BY attempted_at DESC
    LIMIT 20
  `).all(req.params.id);
  res.json({ data: rows.map((r) => ({ ...r, ok: !!r.ok })) });
}));

// Per-hook test: synthesizes an event and delivers ONLY to this hook,
// bypassing the subscription filter so you can test even if you didn't subscribe to webhook.test.
webhooksRouter.post('/:id/test', asyncHandler(async (req, res) => {
  const row = db.prepare(`SELECT * FROM webhooks WHERE id=?`).get(req.params.id);
  if (!row) return notFound(res, 'Webhook');
  deliverOnce(row, {
    id: id('evt'),
    kind: 'webhook.test',
    summary: 'Synthetic test event',
    ref_type: 'webhook',
    ref_id: row.id,
    actor: 'system',
    created_at: new Date().toISOString(),
    test: true,
  }).catch((e) => console.error('[webhook] test deliver crashed', e));
  res.json({ ok: true });
}));

// Legacy stub kept for the Integrations curl example
webhooksRouter.post('/test', asyncHandler(async (req, res) => {
  res.json({ delivered: true, payload: req.body, received_at: new Date().toISOString() });
}));
