# BMAG ITAM

A complete IT Asset Management (ITAM) web application for tracking hardware
assets, software licenses, assignments, and maintenance lifecycles.

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind CSS + shadcn-style components
- **Backend:** Node.js + Express + better-sqlite3
- **Auth:** Mock SSO/SAML provider (Okta / Azure AD stub)
- **Data:** Seeded SQLite database with realistic sample data

## Features

- Hardware inventory (laptops, monitors, peripherals, serials, locations)
- Software & license tracking (seats, keys, expirations, compliance)
- Asset assignments & check-in/check-out workflows with full history
- Maintenance & lifecycle (warranties, depreciation, retirement, tickets)
- Dashboard with asset counts, expiring warranties, cost summary, activity feed
- CSV bulk import & export
- REST API + webhook stubs
- Mock SSO login (toggle via `VITE_AUTH_MODE`)

## Quick start

```bash
npm install
npm run seed     # creates SQLite DB with sample data
npm run dev      # starts server (4000) + client (5173)
```

Open http://localhost:5173.

### Environment

- `VITE_AUTH_MODE=sso` (default) shows the mock SSO login screen
- `VITE_AUTH_MODE=bypass` jumps straight to the dashboard as the demo admin
- `PORT` on the server defaults to `4000`

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run server + client in parallel |
| `npm run seed` | Reset DB and load realistic seed data |
| `npm run reset-db` | Drop all tables |
| `npm run build` | Build client and server for production |
| `npm start` | Run the built server (serves API + static client) |

## API

All endpoints live under `/api`. See `server/src/routes/` for the full surface.

- `GET /api/assets` &mdash; list hardware with filters
- `POST /api/assets/:id/assign` &mdash; check out to a user
- `POST /api/assets/:id/checkin` &mdash; return
- `GET /api/licenses` &mdash; list software licenses
- `GET /api/maintenance` &mdash; maintenance records
- `GET /api/reports/dashboard` &mdash; aggregated dashboard data
- `POST /api/imports/assets` &mdash; CSV bulk upload
- `GET /api/exports/assets.csv` &mdash; CSV export
- `POST /api/webhooks/test` &mdash; webhook stub
