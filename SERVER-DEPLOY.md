# Server deploy runbook (manual)

End-to-end bring-up of BMAG-itam on the Windows Server host using Docker
(Linux engine via WSL2). This is the **manual** flow; automation comes later.
Deeper references: [`DOCKER.md`](DOCKER.md) (container/data/backup) and
[`deploy/iis/README.md`](deploy/iis/README.md) (reverse proxy + TLS).

> The repo lives at `E:\itam\BMAG-itam` on this server. Substitute your path if
> different. Run everything in **PowerShell** on the server.

---

## Prerequisites (have these in hand)

| # | Need | Notes |
|---|---|---|
| 1 | Fresh **Entra client secret** | The original was exposed — generate a new one in the Entra app (Certificates & secrets) and copy the *value*. |
| 2 | **TLS cert** for `itam.bobmoore.com` | A `.pfx`, or plan to use win-acme. |
| 3 | **Docker** with the Linux engine | `docker version` must show a **linux** server. |
| 4 | **DNS** | `itam.bobmoore.com` resolves to this server. |

---

## 1. Get the code

```powershell
cd E:\itam\BMAG-itam
git checkout main          # the deploy branch (NOT the old default)
git pull origin main
git log --oneline -1
```

## 2. Config / secrets (one-time)

```powershell
Copy-Item config\app.env.example config\app.env

# Generate a crypto-strong SESSION_SECRET (base64url):
$b = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_')

notepad config\app.env
```

Set in `config\app.env` (tenant ID is pre-filled; `app.env` is gitignored and
injected at runtime, never baked into the image):

- `APP_BASE_URL=https://itam.bobmoore.com`
- `ENTRA_CLIENT_ID=` — from the Entra app
- `ENTRA_CLIENT_SECRET=` — the **new** secret value
- `ENTRA_ADMIN_GROUP_ID=` — group whose members get admin (empty = everyone admin)
- `SESSION_SECRET=` — the value generated above

## 3. Build & run

```powershell
docker compose up -d --build
docker compose ps                 # app should be Up (healthy) after ~20s
docker compose logs -f app
curl.exe http://127.0.0.1:4000/api/health
```

Healthy boot logs, in order:

```
[auth] Entra SSO enabled. redirect_uri = https://itam.bobmoore.com/api/auth/callback
[migrate] applied 0001-rebill-credits-and-exemptions.sql   (first run only)
[itam] api listening on http://localhost:4000
[auto-sync] interval=300s configured=false
```

`[auth] BYPASS mode` instead means the Entra creds in `app.env` are blank — fix
and `docker compose up -d` again. **Never run bypass in production.**

## 4. TLS / IIS reverse proxy

Full detail in [`deploy/iis/README.md`](deploy/iis/README.md). Short version:

```powershell
# Install URL Rewrite + ARR (download once), then enable server-level proxy:
& "$env:windir\system32\inetsrv\appcmd.exe" set config -section:system.webServer/proxy /enabled:"True" /commit:apphost

# Create the proxy site
New-Item -ItemType Directory -Force C:\inetpub\itam-proxy | Out-Null
Copy-Item .\deploy\iis\web.config C:\inetpub\itam-proxy\web.config
Import-Module WebAdministration
New-Website -Name "itam" -PhysicalPath "C:\inetpub\itam-proxy" -Port 80 -HostHeader "itam.bobmoore.com"

# Import + bind the cert (.pfx)
Import-PfxCertificate -FilePath C:\path\itam.pfx -CertStoreLocation Cert:\LocalMachine\My -Password (Read-Host -AsSecureString -Prompt "PFX password")
New-WebBinding -Name "itam" -Protocol https -Port 443 -HostHeader "itam.bobmoore.com" -SslFlags 1
$cert = Get-ChildItem Cert:\LocalMachine\My | Where-Object Subject -match "itam.bobmoore.com"
New-Item -Path "IIS:\SslBindings\!443!itam.bobmoore.com" -Value $cert
```

## 5. Entra redirect URIs (must match exactly)

In the Entra app registration:
- **Redirect URI:** `https://itam.bobmoore.com/api/auth/callback`
- **Front-channel logout URL:** `https://itam.bobmoore.com/login`

## 6. Verify & bootstrap

```powershell
curl.exe -I https://itam.bobmoore.com/api/health    # 200, valid TLS
```

Browse to `https://itam.bobmoore.com`, sign in with Microsoft → **Settings** →
enter Freshservice creds → run a sync (the container starts with an empty DB).

---

## Updating to a new version

```powershell
cd E:\itam\BMAG-itam
git pull origin main
docker compose up -d --build      # migrations apply at boot; DB volume preserved
docker compose logs -f app
```

Roll back by checking out the previous commit and rebuilding. The SQLite DB lives
on the `itam-data` volume and is never touched by a rebuild — back it up before
any release with a migration (see [`DOCKER.md`](DOCKER.md) §3).

## Survives reboot?

- `restart: unless-stopped` restarts the container once the Docker engine is up.
- **Docker Desktop** only starts on user login — for unattended reboots, enable
  "Start Docker Desktop when you log in" and configure the host to auto-login the
  service account, or use **Docker Engine in WSL2** (starts without a login).
