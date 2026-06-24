# Running BMAG-itam with Docker

The app ships as a single Linux container: the Node server serves the REST API
**and** the built React SPA, and applies any pending schema migrations at startup
(`server/src/migrate.js`). SQLite data lives on a volume, outside the image, so it
survives rebuilds and upgrades.

> **Host:** built for `linux/amd64`. Runs on a Linux host/VM or on Windows Server
> via the WSL2/Docker Desktop Linux engine. (Native Windows containers are not
> supported by this Dockerfile.)

---

## 1. First run

```sh
# from the repo root on the server
cp config/app.env.example config/app.env
#   then edit config/app.env — at minimum set:
#     APP_BASE_URL, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, ENTRA_ADMIN_GROUP_ID, SESSION_SECRET
#   generate a session secret:
#     node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

docker compose up -d --build
docker compose logs -f app          # watch it boot
```

A healthy boot logs, in order:

```
[auth] Entra SSO enabled. redirect_uri = https://itam.bobmoore.com/api/auth/callback
[migrate] up to date — no pending migrations
[itam] api listening on http://localhost:4000
[auto-sync] interval=300s configured=false
```

The container starts empty. Sign in, open **Settings**, enter Freshservice creds,
and run a sync to populate assets/users/locations.

Quick local check (bypasses the proxy): `curl http://127.0.0.1:4000/api/health`.

---

## 2. TLS / reverse proxy (required)

The app publishes only on `127.0.0.1:4000` and sets **Secure** cookies in
production, so users must reach it over HTTPS through a reverse proxy. Two options:

### Option A — IIS on the host (this deployment) ✅
Reverse-proxy `https://itam.bobmoore.com` → `http://127.0.0.1:4000` (ARR + URL
Rewrite, terminating TLS with your public cert). The container's loopback publish
is exactly what IIS needs. **Full setup + `web.config`: [`deploy/iis/README.md`](deploy/iis/README.md).**

### Option B — a Caddy container (drop-in)
Add a proxy service to the stack and remove the app's `ports:` block (the proxy
reaches the app as `app:4000` over the compose network). Minimal `Caddyfile`:

```
itam.bobmoore.com {
    # For an internal CA cert, supply it explicitly:
    tls /etc/caddy/itam.crt /etc/caddy/itam.key
    reverse_proxy app:4000
}
```

```yaml
# add under services: in docker-compose.yml
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["443:443", "80:80"]
    volumes:
      - ./config/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./config/certs:/etc/caddy        # your itam.crt / itam.key
      - caddy-data:/data
# and add `caddy-data:` under the top-level volumes:
```

> Whichever proxy you use, register `https://itam.bobmoore.com/api/auth/callback`
> as the redirect URI in the Entra app, and set `APP_BASE_URL` to the same origin.

---

## 3. Data & backups

The SQLite DB (and its WAL/SHM sidecars) live on the `itam-data` named volume at
`/data/itam.db`. It is never touched by a rebuild or `docker compose up`.

```sh
# back up (online-safe: .backup handles WAL correctly)
docker compose exec app node -e "require('better-sqlite3')(process.env.DB_PATH).backup('/data/backup-'+Date.now()+'.db')"
docker compose cp app:/data ./itam-data-backup        # copy the whole dir out

# inspect the volume location on the host
docker volume inspect bmag-itam_itam-data
```

Back up before any release that includes a migration.

---

## 4. Updating (deploying a new version)

```sh
git pull
docker compose up -d --build      # rebuild image, recreate container
docker compose logs -f app        # confirm migrations + healthy boot
```

Schema changes are applied automatically at boot by the migration runner — no
reset/reseed, and the volume's data is preserved. If a migration fails the
container exits non-zero and stays down (it won't serve a half-migrated DB); fix
the migration, rebuild, and it retries. Roll back by checking out the previous
commit and rebuilding.

> A push-to-deploy pipeline (GitHub Actions → build → server pulls/rebuilds) can
> automate step 4. That's the next layer once the manual flow is confirmed.

---

## 5. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `better-sqlite3 ... invalid ELF header` / ABI error | Image built for a different arch. Rebuild on the target host: `docker compose build --no-cache`. |
| Login loops / cookie not set | App not reached over HTTPS, or `APP_BASE_URL` ≠ the real origin / Entra redirect URI. |
| `EACCES` writing `/data` (bind mount) | `chown -R 1000:1000 <host-dir>` — the container runs as uid 1000 (`node`). Named volumes don't need this. |
| Stuck on `[auth] BYPASS mode` | Entra creds missing/blank in `config/app.env`. Bypass must never be used in prod. |
| Health check failing | `docker compose logs app`; hit `curl http://127.0.0.1:4000/api/health` on the host. |
