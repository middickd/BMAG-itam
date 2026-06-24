import crypto from 'node:crypto';
import { db } from './db.js';
import { id } from './util.js';

const DELIVERY_TIMEOUT_MS = 5000;
const RESPONSE_SNIPPET_BYTES = 300;

function eventMatches(subscribed, kind) {
  if (!Array.isArray(subscribed)) return false;
  if (subscribed.includes('*')) return true;
  if (subscribed.includes(kind)) return true;
  // namespace wildcard, e.g. "asset.*" matches "asset.assigned"
  for (const e of subscribed) {
    if (e.endsWith('.*') && kind.startsWith(e.slice(0, -1))) return true;
  }
  return false;
}

function sign(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export async function deliverOnce(hook, event) {
  return deliver(hook, event);
}

async function deliver(hook, event) {
  const body = JSON.stringify(event);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'bmag-itam-webhook/1.0',
    'X-BMAG-Event': event.kind,
    'X-BMAG-Delivery': event.id,
  };
  if (hook.secret) headers['X-BMAG-Signature'] = `sha256=${sign(hook.secret, body)}`;

  const started = Date.now();
  let statusCode = null;
  let ok = false;
  let error = null;
  let snippet = null;

  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), DELIVERY_TIMEOUT_MS);
    const res = await fetch(hook.url, { method: 'POST', headers, body, signal: ctrl.signal });
    clearTimeout(to);
    statusCode = res.status;
    ok = res.ok;
    try {
      const text = await res.text();
      snippet = text.slice(0, RESPONSE_SNIPPET_BYTES);
    } catch { /* ignore body read errors */ }
  } catch (e) {
    error = e.name === 'AbortError' ? `timeout after ${DELIVERY_TIMEOUT_MS}ms` : (e.message || String(e));
  }

  const latency = Date.now() - started;
  db.prepare(`
    INSERT INTO webhook_deliveries (id, webhook_id, event_kind, payload, status_code, ok, error, response_snippet, latency_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id('whd'), hook.id, event.kind, body, statusCode, ok ? 1 : 0, error, snippet, latency);
  db.prepare(`UPDATE webhooks SET last_delivery_at=datetime('now'), last_status=? WHERE id=?`).run(statusCode, hook.id);
}

export function dispatchEvent(event) {
  const hooks = db.prepare(`SELECT * FROM webhooks WHERE enabled = 1`).all();
  for (const h of hooks) {
    let subscribed;
    try { subscribed = JSON.parse(h.events); } catch { subscribed = ['*']; }
    if (!eventMatches(subscribed, event.kind)) continue;
    // fire-and-forget, never let a webhook error bubble back into the request
    deliver(h, event).catch((e) => console.error('[webhook] deliver crashed', e));
  }
}
