import { Router } from 'express';
import { asyncHandler, logActivity } from '../util.js';

export const webhooksRouter = Router();

// Stubbed webhook subscriptions - in-memory only
const subscriptions = new Map();

webhooksRouter.get('/', (_req, res) => {
  res.json({ data: [...subscriptions.values()] });
});

webhooksRouter.post('/', asyncHandler(async (req, res) => {
  const { url, events = ['*'], secret } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  const subId = `wh_${Date.now()}`;
  const sub = { id: subId, url, events, secret: secret ? '****' : null, created_at: new Date().toISOString() };
  subscriptions.set(subId, sub);
  logActivity({ kind: 'webhook.created', summary: `Webhook registered: ${url}`, ref_type: 'webhook', ref_id: subId });
  res.status(201).json(sub);
}));

webhooksRouter.delete('/:id', (req, res) => {
  subscriptions.delete(req.params.id);
  res.status(204).end();
});

webhooksRouter.post('/test', asyncHandler(async (req, res) => {
  res.json({ delivered: true, payload: req.body, received_at: new Date().toISOString() });
}));
