import { Router } from 'express';
import { db } from '../db.js';

export const authRouter = Router();

// Mock SSO providers - production would route through real IdP
const PROVIDERS = [
  { id: 'okta', name: 'Okta', color: '#007DC1' },
  { id: 'azure', name: 'Microsoft Entra ID', color: '#0078D4' },
  { id: 'google', name: 'Google Workspace', color: '#EA4335' },
];

authRouter.get('/providers', (_req, res) => {
  res.json({ providers: PROVIDERS });
});

// Mock SAML SSO endpoint - in real life would redirect to IdP then back via SAMLResponse POST
authRouter.post('/sso/:provider', (req, res) => {
  const provider = PROVIDERS.find((p) => p.id === req.params.provider);
  if (!provider) return res.status(404).json({ error: 'Unknown provider' });

  // Demo: log in as the seeded admin
  const user = db.prepare(`SELECT * FROM users WHERE role = 'admin' LIMIT 1`).get();
  if (!user) return res.status(500).json({ error: 'No admin user seeded' });

  res.json({
    token: `mock-saml-${provider.id}-${Date.now()}`,
    provider: provider.name,
    user,
  });
});

authRouter.get('/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const user = db.prepare(`SELECT * FROM users WHERE role = 'admin' LIMIT 1`).get();
  res.json({ user, token });
});
