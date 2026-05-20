import { db } from './db.js';

db.exec(`
  DROP TABLE IF EXISTS activity;
  DROP TABLE IF EXISTS license_assignments;
  DROP TABLE IF EXISTS assignments;
  DROP TABLE IF EXISTS maintenance;
  DROP TABLE IF EXISTS licenses;
  DROP TABLE IF EXISTS software;
  DROP TABLE IF EXISTS assets;
  DROP TABLE IF EXISTS users;
  DROP TABLE IF EXISTS locations;
  DROP TABLE IF EXISTS vendors;
`);
console.log('[reset] all tables dropped');
process.exit(0);
