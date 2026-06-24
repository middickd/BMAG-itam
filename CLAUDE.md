# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This is an npm workspaces monorepo (`client/` + `server/`). Run scripts from the repo root.

| Command | What it does |
|---|---|
| `npm install` | Install all workspaces |
| `npm run seed` | Wipe the SQLite DB and reload realistic sample data — **run this once before first `dev`** |
| `npm run dev` | Concurrently runs Express API on `:4000` and Vite dev server on `:5173` (Vite proxies `/api` → `:4000`) |
| `npm run reset-db` | Drop all tables (use before re-seeding if schema changed) |
| `npm run build` | `tsc -b && vite build` for client; server has no build step |
| `npm start` | Run built server which also serves `client/dist` as static files |

To run only one side: `npm run dev:server` or `npm run dev:client`.

There is **no test runner and no linter** configured. `npm run build` (which runs `tsc -b`) is the only correctness check for the client. Server is plain JS (ESM, `"type": "module"`) with no typecheck.

### Environment
- `VITE_AUTH_MODE=sso` (default) — shows mock SSO login screen at `/login`.
- `VITE_AUTH_MODE=bypass` — auto-logs in as the seeded admin via `POST /api/auth/sso/okta`.
- `PORT` (server) defaults to `4000`. `DB_PATH` overrides `server/data/itam.db`.

Requires Node >= 20. `better-sqlite3` is pinned to v12 for prebuilt Node 24 binaries.

## Architecture

### Server (`server/src/`)
- **`db.js`** — opens `server/data/itam.db` (WAL mode, FKs on) and runs `initSchema()` on import. Importing `db` anywhere triggers schema creation; there is no migration system, so schema changes need `npm run reset-db && npm run seed`.
- **`index.js`** — Express app, mounts every router under `/api/<name>`. In production, if `client/dist` exists it's served as static + SPA fallback from the same process.
- **`routes/*.js`** — one router per domain (assets, licenses, users, maintenance, reports, imports, exports, webhooks, lookups, activity, auth). All handlers use the `asyncHandler` wrapper from `util.js`.
- **`util.js`** — shared helpers:
  - `id('ast')` — nanoid with a type prefix (`ast_…`, `asn_…`, `act_…`, `loc_…`, `vnd_…`). Use the matching prefix when inserting new rows.
  - `logActivity({ kind, summary, ref_type, ref_id, actor })` — every mutating endpoint writes one row here; the dashboard activity feed depends on this. New write endpoints should follow suit.
  - `pickAssetUpdate(body)` — whitelist for updatable asset columns; mirror this pattern when adding new resource update endpoints.
  - `depreciatedValue(asset)` — straight-line over `depreciation_years` (default 3). Computed at read time, not stored.

### Asset assignment model (important denormalization)
Assignments are tracked **twice**: in the `assignments` history table (one row per check-out, with `returned_at` set on return) and on `assets` itself via `assigned_to` / `assigned_at` / `status`. Always update both in a single `db.transaction(() => …)` (see `routes/assets.js` `/assign` and `/checkin`) — never set `assets.assigned_to` without closing/opening the corresponding `assignments` row.

### Auth (mock)
`routes/auth.js` does not implement real auth. `POST /api/auth/sso/:provider` returns a fake token and the first seeded admin user. `GET /api/auth/me` ignores the token's content. The client stores token + user in `localStorage` (`bmag-itam-token`, `bmag-itam-user`) and attaches `Authorization: Bearer …` via `client/src/lib/api.ts`. There is no per-user authorization in the backend — every request acts as the admin.

### Client (`client/src/`)
- Vite + React 18 + TS + Tailwind + Radix UI primitives (`components/ui/` are shadcn-style copies).
- Path alias: `@/*` → `src/*`.
- Routing in `App.tsx` — all routes except `/login` are wrapped in `<RequireAuth>` + `<Layout>`. `<RequireAuth>` performs the auto-login when `VITE_AUTH_MODE=bypass`.
- Data fetching: `@tanstack/react-query` + the `api` helper in `lib/api.ts` (thin wrapper around `fetch` that prefixes `/api`, injects the bearer token, and parses JSON).
- All API calls go through `lib/api.ts` — don't add raw `fetch` calls to API endpoints elsewhere.

### Seed data
`server/src/seed.js` deletes all rows then repopulates locations, vendors, users, assets, software/licenses, assignments, maintenance, and activity. It's idempotent and safe to re-run. The first admin user it inserts is what the mock SSO endpoint returns.
