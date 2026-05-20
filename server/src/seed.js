import { db, initSchema } from './db.js';
import { id, logActivity } from './util.js';

console.log('[seed] starting...');

db.exec(`
  DELETE FROM activity;
  DELETE FROM license_assignments;
  DELETE FROM assignments;
  DELETE FROM maintenance;
  DELETE FROM licenses;
  DELETE FROM software;
  DELETE FROM assets;
  DELETE FROM users;
  DELETE FROM locations;
  DELETE FROM vendors;
`);

initSchema();

// ---------- Locations ----------
const locations = [
  { id: id('loc'), name: 'HQ - San Francisco', address: '500 Howard St', city: 'San Francisco', country: 'USA' },
  { id: id('loc'), name: 'NYC Office', address: '350 5th Ave', city: 'New York', country: 'USA' },
  { id: id('loc'), name: 'London Office', address: '1 Canada Square', city: 'London', country: 'UK' },
  { id: id('loc'), name: 'Berlin Office', address: 'Friedrichstraße 200', city: 'Berlin', country: 'Germany' },
  { id: id('loc'), name: 'Remote', city: 'Distributed' },
  { id: id('loc'), name: 'Warehouse', address: '12 Industrial Way', city: 'Oakland', country: 'USA' },
];
const locStmt = db.prepare('INSERT INTO locations (id,name,address,city,country) VALUES (?,?,?,?,?)');
for (const l of locations) locStmt.run(l.id, l.name, l.address || null, l.city || null, l.country || null);

// ---------- Vendors ----------
const vendors = [
  { id: id('vnd'), name: 'Apple', contact_email: 'business@apple.com', website: 'https://apple.com' },
  { id: id('vnd'), name: 'Dell', contact_email: 'corp@dell.com', website: 'https://dell.com' },
  { id: id('vnd'), name: 'Lenovo', contact_email: 'enterprise@lenovo.com', website: 'https://lenovo.com' },
  { id: id('vnd'), name: 'Microsoft', contact_email: 'volume@microsoft.com', website: 'https://microsoft.com' },
  { id: id('vnd'), name: 'Adobe', contact_email: 'vip@adobe.com', website: 'https://adobe.com' },
  { id: id('vnd'), name: 'Atlassian', contact_email: 'sales@atlassian.com', website: 'https://atlassian.com' },
  { id: id('vnd'), name: 'GitHub', contact_email: 'enterprise@github.com', website: 'https://github.com' },
  { id: id('vnd'), name: 'Logitech', contact_email: 'b2b@logitech.com', website: 'https://logitech.com' },
  { id: id('vnd'), name: 'CDW', contact_email: 'orders@cdw.com', website: 'https://cdw.com' },
];
const vndStmt = db.prepare('INSERT INTO vendors (id,name,contact_email,website) VALUES (?,?,?,?)');
for (const v of vendors) vndStmt.run(v.id, v.name, v.contact_email, v.website);
const vendor = (n) => vendors.find((v) => v.name === n).id;

// ---------- Users ----------
const departments = ['Engineering', 'Design', 'Product', 'Sales', 'Marketing', 'Finance', 'People', 'IT'];
const titles = {
  Engineering: ['Software Engineer', 'Staff Engineer', 'Engineering Manager', 'SRE'],
  Design: ['Product Designer', 'Design Lead'],
  Product: ['Product Manager', 'Sr. PM'],
  Sales: ['Account Executive', 'SDR', 'Sales Manager'],
  Marketing: ['Marketing Manager', 'Content Lead'],
  Finance: ['Financial Analyst', 'Controller'],
  People: ['Recruiter', 'People Ops'],
  IT: ['IT Admin', 'Helpdesk', 'IT Manager'],
};
const firstNames = ['Alex','Sam','Jamie','Taylor','Jordan','Casey','Riley','Morgan','Avery','Quinn','Drew','Reese','Hayden','Skyler','Cameron','Parker','Rowan','Sage','Emerson','Finley','Priya','Yuki','Mateo','Aisha','Liam','Noah','Olivia','Ava','Sofia','Diego','Chen','Ravi','Mira','Kai','Zoe','Felix','Maya','Hugo','Iris','Theo'];
const lastNames = ['Patel','Nguyen','Garcia','Smith','Kim','Johnson','Lee','Brown','Singh','Martinez','Wong','Hernandez','Davis','Williams','Anderson','Rodriguez','Chen','Sato','Müller','Cohen','Okafor','Schmidt','Rossi','Dubois','Tanaka','Khan','Murphy'];
const avatarColors = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#84cc16'];

const users = [];
users.push({
  id: id('usr'),
  email: 'admin@bmag.example',
  name: 'Avery Reed',
  role: 'admin',
  department: 'IT',
  title: 'IT Director',
  avatar_color: '#3b82f6',
});

for (let i = 0; i < 39; i++) {
  const fn = firstNames[i % firstNames.length];
  const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
  const dept = departments[Math.floor(Math.random() * departments.length)];
  users.push({
    id: id('usr'),
    email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@bmag.example`,
    name: `${fn} ${ln}`,
    role: i < 3 ? 'manager' : 'user',
    department: dept,
    title: titles[dept][Math.floor(Math.random() * titles[dept].length)],
    avatar_color: avatarColors[Math.floor(Math.random() * avatarColors.length)],
  });
}
const usrStmt = db.prepare('INSERT INTO users (id,email,name,role,department,title,avatar_color) VALUES (?,?,?,?,?,?,?)');
for (const u of users) usrStmt.run(u.id, u.email, u.name, u.role, u.department, u.title, u.avatar_color);

// ---------- Assets ----------
const hardwareCatalog = [
  { category: 'Laptop', manufacturer: 'Apple', model: 'MacBook Pro 14" M3', cost: 2499, vendor: 'Apple' },
  { category: 'Laptop', manufacturer: 'Apple', model: 'MacBook Pro 16" M3 Max', cost: 3499, vendor: 'Apple' },
  { category: 'Laptop', manufacturer: 'Apple', model: 'MacBook Air 13" M2', cost: 1299, vendor: 'Apple' },
  { category: 'Laptop', manufacturer: 'Dell', model: 'XPS 15 9530', cost: 1899, vendor: 'Dell' },
  { category: 'Laptop', manufacturer: 'Lenovo', model: 'ThinkPad X1 Carbon Gen 11', cost: 1749, vendor: 'Lenovo' },
  { category: 'Desktop', manufacturer: 'Apple', model: 'Mac Studio M2 Max', cost: 2399, vendor: 'Apple' },
  { category: 'Desktop', manufacturer: 'Dell', model: 'OptiPlex 7010', cost: 999, vendor: 'Dell' },
  { category: 'Monitor', manufacturer: 'Apple', model: 'Studio Display 27"', cost: 1599, vendor: 'Apple' },
  { category: 'Monitor', manufacturer: 'Dell', model: 'UltraSharp U2723QE 27"', cost: 649, vendor: 'Dell' },
  { category: 'Monitor', manufacturer: 'LG', model: 'UltraFine 5K 27"', cost: 1299, vendor: 'CDW' },
  { category: 'Phone', manufacturer: 'Apple', model: 'iPhone 15 Pro', cost: 999, vendor: 'Apple' },
  { category: 'Tablet', manufacturer: 'Apple', model: 'iPad Pro 12.9"', cost: 1099, vendor: 'Apple' },
  { category: 'Peripheral', manufacturer: 'Logitech', model: 'MX Master 3S Mouse', cost: 99, vendor: 'Logitech' },
  { category: 'Peripheral', manufacturer: 'Logitech', model: 'MX Keys Keyboard', cost: 119, vendor: 'Logitech' },
  { category: 'Peripheral', manufacturer: 'Apple', model: 'Magic Keyboard', cost: 129, vendor: 'Apple' },
  { category: 'Headset', manufacturer: 'Sony', model: 'WH-1000XM5', cost: 399, vendor: 'CDW' },
  { category: 'Dock', manufacturer: 'CalDigit', model: 'TS4 Thunderbolt Dock', cost: 399, vendor: 'CDW' },
  { category: 'Server', manufacturer: 'Dell', model: 'PowerEdge R750', cost: 7999, vendor: 'Dell' },
  { category: 'Networking', manufacturer: 'Cisco', model: 'Meraki MX67', cost: 595, vendor: 'CDW' },
];

const statuses = ['in_stock', 'deployed', 'deployed', 'deployed', 'deployed', 'maintenance', 'retired'];
const conditions = ['new', 'good', 'good', 'good', 'fair', 'poor'];

const assets = [];
let tagSeq = 1000;
function randDate(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  return d.toISOString().slice(0, 10);
}
function futureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + Math.floor(Math.random() * daysAhead));
  return d.toISOString().slice(0, 10);
}

for (let i = 0; i < 140; i++) {
  const catalog = hardwareCatalog[Math.floor(Math.random() * hardwareCatalog.length)];
  const status = statuses[Math.floor(Math.random() * statuses.length)];
  const assignedTo = status === 'deployed' ? users[Math.floor(Math.random() * users.length)].id : null;
  const loc = locations[Math.floor(Math.random() * locations.length)].id;
  const purchase_date = randDate(900);
  // Warranty: ~3yr from purchase, randomized
  const warrantyDays = 365 * (Math.random() > 0.3 ? 3 : 1);
  const warrantyDate = new Date(purchase_date);
  warrantyDate.setDate(warrantyDate.getDate() + warrantyDays);
  // Make some warranties expire soon
  let warranty_expires_at = warrantyDate.toISOString().slice(0, 10);
  if (Math.random() < 0.15) {
    warranty_expires_at = futureDate(60);
  }
  assets.push({
    id: id('ast'),
    asset_tag: `BMAG-${String(tagSeq++).padStart(5, '0')}`,
    category: catalog.category,
    model: catalog.model,
    manufacturer: catalog.manufacturer,
    serial_number: `SN${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    status,
    condition: conditions[Math.floor(Math.random() * conditions.length)],
    location_id: loc,
    assigned_to: assignedTo,
    assigned_at: assignedTo ? randDate(180) : null,
    vendor_id: vendor(catalog.vendor),
    purchase_date,
    purchase_cost: catalog.cost,
    warranty_expires_at,
    depreciation_years: catalog.category === 'Laptop' || catalog.category === 'Desktop' ? 3 : 4,
    retired_at: status === 'retired' ? randDate(90) : null,
    notes: Math.random() < 0.1 ? 'Reissued from previous employee' : null,
  });
}

const astCols = ['id','asset_tag','category','model','manufacturer','serial_number','status','condition','location_id','assigned_to','assigned_at','vendor_id','purchase_date','purchase_cost','warranty_expires_at','depreciation_years','retired_at','notes'];
const astStmt = db.prepare(`INSERT INTO assets (${astCols.join(',')}) VALUES (${astCols.map(()=>'?').join(',')})`);
for (const a of assets) astStmt.run(...astCols.map((c) => a[c]));

// Assignments history
const asnStmt = db.prepare('INSERT INTO assignments (id, asset_id, user_id, assigned_at, returned_at, note) VALUES (?,?,?,?,?,?)');
for (const a of assets) {
  if (a.assigned_to) {
    asnStmt.run(id('asn'), a.id, a.assigned_to, a.assigned_at, null, null);
  }
  // Some assets have prior assignments
  if (Math.random() < 0.25) {
    const prevUser = users[Math.floor(Math.random() * users.length)].id;
    const start = randDate(720);
    const end = randDate(180);
    asnStmt.run(id('asn'), a.id, prevUser, start, end, 'Previous assignment');
  }
}

// ---------- Software & Licenses ----------
const softwareList = [
  { name: 'Microsoft 365 Business', publisher: 'Microsoft', version: '2024', category: 'Productivity', vendor: 'Microsoft', costPerSeat: 22, billing: 'monthly', seats: 50 },
  { name: 'Adobe Creative Cloud', publisher: 'Adobe', version: '2024', category: 'Design', vendor: 'Adobe', costPerSeat: 84, billing: 'monthly', seats: 15 },
  { name: 'Figma Organization', publisher: 'Figma', version: 'Web', category: 'Design', vendor: 'CDW', costPerSeat: 45, billing: 'monthly', seats: 25 },
  { name: 'Jira Software', publisher: 'Atlassian', version: 'Cloud', category: 'Project Mgmt', vendor: 'Atlassian', costPerSeat: 8.15, billing: 'monthly', seats: 60 },
  { name: 'Confluence', publisher: 'Atlassian', version: 'Cloud', category: 'Knowledge', vendor: 'Atlassian', costPerSeat: 6.05, billing: 'monthly', seats: 60 },
  { name: 'GitHub Enterprise', publisher: 'GitHub', version: 'Cloud', category: 'Dev Tools', vendor: 'GitHub', costPerSeat: 21, billing: 'monthly', seats: 40 },
  { name: 'Slack Business+', publisher: 'Salesforce', version: 'Web', category: 'Communication', vendor: 'CDW', costPerSeat: 12.5, billing: 'monthly', seats: 80 },
  { name: 'Zoom Workplace Pro', publisher: 'Zoom', version: '6.0', category: 'Communication', vendor: 'CDW', costPerSeat: 14.99, billing: 'monthly', seats: 50 },
  { name: 'Notion Plus', publisher: 'Notion', version: 'Web', category: 'Productivity', vendor: 'CDW', costPerSeat: 10, billing: 'monthly', seats: 35 },
  { name: 'Salesforce Sales Cloud', publisher: 'Salesforce', version: 'Enterprise', category: 'CRM', vendor: 'CDW', costPerSeat: 165, billing: 'monthly', seats: 12 },
  { name: '1Password Business', publisher: '1Password', version: 'Web', category: 'Security', vendor: 'CDW', costPerSeat: 7.99, billing: 'monthly', seats: 80 },
  { name: 'CrowdStrike Falcon', publisher: 'CrowdStrike', version: '7.x', category: 'Security', vendor: 'CDW', costPerSeat: 18, billing: 'annual', seats: 140 },
];

const swStmt = db.prepare('INSERT INTO software (id,name,publisher,version,category) VALUES (?,?,?,?,?)');
const licStmt = db.prepare('INSERT INTO licenses (id,software_id,license_key,seats,seats_used,cost_per_seat,billing_cycle,purchase_date,expires_at,vendor_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
const licAsnStmt = db.prepare('INSERT INTO license_assignments (id, license_id, user_id) VALUES (?,?,?)');

const licenses = [];
for (const s of softwareList) {
  const swId = id('sw');
  swStmt.run(swId, s.name, s.publisher, s.version, s.category);
  const seatsUsed = Math.floor(s.seats * (0.55 + Math.random() * 0.4));
  // Expiry mix: some expired-soon
  let expDate;
  if (Math.random() < 0.25) {
    expDate = futureDate(60);
  } else {
    const d = new Date();
    d.setDate(d.getDate() + 200 + Math.floor(Math.random() * 400));
    expDate = d.toISOString().slice(0, 10);
  }
  const licId = id('lic');
  licStmt.run(
    licId, swId,
    `LIC-${Math.random().toString(36).slice(2, 14).toUpperCase()}`,
    s.seats, seatsUsed, s.costPerSeat, s.billing,
    randDate(400), expDate, vendor(s.vendor)
  );
  licenses.push({ id: licId, seats: s.seats, seatsUsed });
  // Assign seats
  const userPool = [...users].sort(() => Math.random() - 0.5).slice(0, seatsUsed);
  for (const u of userPool) {
    licAsnStmt.run(id('lic-a'), licId, u.id);
  }
}

// ---------- Maintenance ----------
const mntStmt = db.prepare('INSERT INTO maintenance (id, asset_id, type, status, description, cost, reported_by, assigned_tech, opened_at, resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
const issues = [
  { type: 'Battery replacement', desc: 'Battery health below 70%, requires service' },
  { type: 'Screen repair', desc: 'Cracked display reported after fall' },
  { type: 'Keyboard issue', desc: 'Sticky keys and unresponsive shift' },
  { type: 'Performance', desc: 'Slow boot times, requesting reimage' },
  { type: 'OS reinstall', desc: 'Routine reimaging for re-deployment' },
  { type: 'Network', desc: 'Wifi card intermittent connection' },
  { type: 'Power adapter', desc: 'Charger replacement required' },
];
const itTech = users.filter((u) => u.department === 'IT').map((u) => u.name);
for (let i = 0; i < 18; i++) {
  const asset = assets[Math.floor(Math.random() * assets.length)];
  const issue = issues[Math.floor(Math.random() * issues.length)];
  const resolved = Math.random() < 0.5;
  const opened = randDate(120);
  mntStmt.run(
    id('mnt'), asset.id, issue.type, resolved ? 'resolved' : 'open',
    issue.desc, Math.floor(Math.random() * 500) + 50,
    users[Math.floor(Math.random() * users.length)].id,
    itTech[Math.floor(Math.random() * itTech.length)] || null,
    opened,
    resolved ? randDate(60) : null,
  );
}

// ---------- Seed activity feed ----------
const activitySeed = [
  { kind: 'asset.assigned', summary: 'Assigned BMAG-01001 to Mira Patel' },
  { kind: 'asset.created', summary: 'Created 12 new assets via CSV import' },
  { kind: 'license.assigned', summary: 'Assigned Figma seat to Diego Hernandez' },
  { kind: 'maintenance.opened', summary: 'Maintenance opened for BMAG-01042: Battery replacement' },
  { kind: 'asset.returned', summary: 'BMAG-01023 returned from Sam Lee' },
  { kind: 'license.revoked', summary: 'Revoked Adobe Creative Cloud seat (departing employee)' },
  { kind: 'maintenance.resolved', summary: 'Resolved maintenance for BMAG-01012' },
  { kind: 'asset.retired', summary: 'Retired BMAG-00917 (end of life)' },
  { kind: 'asset.assigned', summary: 'Assigned BMAG-01108 to Jordan Kim' },
  { kind: 'webhook.created', summary: 'Webhook registered: https://hooks.example.com/itam' },
];
for (const a of activitySeed) logActivity(a);

const summary = {
  users: users.length,
  locations: locations.length,
  vendors: vendors.length,
  assets: assets.length,
  software: softwareList.length,
  licenses: licenses.length,
};
console.log('[seed] complete:', summary);
process.exit(0);
