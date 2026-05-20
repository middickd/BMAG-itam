import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { assetsRouter } from './routes/assets.js';
import { usersRouter } from './routes/users.js';
import { licensesRouter } from './routes/licenses.js';
import { maintenanceRouter } from './routes/maintenance.js';
import { reportsRouter } from './routes/reports.js';
import { authRouter } from './routes/auth.js';
import { importsRouter } from './routes/imports.js';
import { exportsRouter } from './routes/exports.js';
import { webhooksRouter } from './routes/webhooks.js';
import { lookupsRouter } from './routes/lookups.js';
import { activityRouter } from './routes/activity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM assets').get();
  res.json({ ok: true, assets: count.c, time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/users', usersRouter);
app.use('/api/licenses', licensesRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/imports', importsRouter);
app.use('/api/exports', exportsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/lookups', lookupsRouter);
app.use('/api/activity', activityRouter);

// Serve client in production
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`[itam] api listening on http://localhost:${port}`);
});
