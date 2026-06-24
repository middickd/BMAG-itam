# IIS reverse proxy — itam.bobmoore.com → Docker container

IIS on Windows Server 2025 terminates TLS for `https://itam.bobmoore.com` and
forwards to the BMAG-itam container published on `127.0.0.1:4000`. The app itself
needs no proxy headers (Secure cookies come from `NODE_ENV`, URLs from
`APP_BASE_URL`), so this is a thin pass-through proxy.

```
 browser ──HTTPS──► IIS (TLS, :443) ──HTTP──► 127.0.0.1:4000 ──► Docker container
```

## Prerequisites

- The container is running and reachable on the host: `curl http://127.0.0.1:4000/api/health`.
- DNS: `itam.bobmoore.com` resolves to this server.
- Your public TLS cert for `itam.bobmoore.com` (see "Certificate" below).

## 1. Install the proxy modules

Install on the server (once):

- **URL Rewrite** — https://www.iis.net/downloads/microsoft/url-rewrite
- **Application Request Routing (ARR)** — https://www.iis.net/downloads/microsoft/application-request-routing

Then enable proxying at the server level (this is the step people forget):

> IIS Manager → select the **server node** → **Application Request Routing Cache**
> → **Server Proxy Settings** → tick **Enable proxy** → Apply.

Or via PowerShell (`appcmd`):

```powershell
& "$env:windir\system32\inetsrv\appcmd.exe" set config -section:system.webServer/proxy /enabled:"True" /commit:apphost
```

## 2. Create the proxy site

```powershell
New-Item -ItemType Directory -Force C:\inetpub\itam-proxy | Out-Null
Copy-Item .\deploy\iis\web.config C:\inetpub\itam-proxy\web.config
Import-Module WebAdministration
New-Website -Name "itam" -PhysicalPath "C:\inetpub\itam-proxy" -Port 80 -HostHeader "itam.bobmoore.com"
```

(The folder is empty apart from `web.config` — the rewrite rule forwards everything
to the container.)

## 3. Certificate & HTTPS binding

**Purchased / provided cert (.pfx):**

```powershell
Import-PfxCertificate -FilePath C:\path\itam.pfx -CertStoreLocation Cert:\LocalMachine\My `
  -Password (Read-Host -AsSecureString -Prompt "PFX password")
# bind it (use the imported cert's thumbprint)
New-WebBinding -Name "itam" -Protocol https -Port 443 -HostHeader "itam.bobmoore.com" -SslFlags 1
$cert = Get-ChildItem Cert:\LocalMachine\My | Where-Object Subject -match "itam.bobmoore.com"
New-Item -Path "IIS:\SslBindings\!443!itam.bobmoore.com" -Value $cert
```

**Let's Encrypt / ACME:** use **win-acme** (https://www.win-acme.com) — it issues,
binds, and auto-renews against IIS. HTTP-01 validation needs the site reachable
from the internet on port 80; if `itam.bobmoore.com` is internal-only, use win-acme's
**DNS-01** validation against whoever hosts the public DNS zone instead.

> After HTTPS is bound, the `:80` binding is only needed for ACME HTTP-01 renewals.
> Optionally add an HTTP→HTTPS redirect rule, or remove `:80` if you renew via DNS-01.

## 4. Verify

```powershell
curl.exe -I https://itam.bobmoore.com/api/health   # 200, valid TLS
```

Then browse to `https://itam.bobmoore.com` and complete the Microsoft sign-in.

## 5. Entra app registration (must match the public URL)

In the Entra app for BMAG-itam:
- **Redirect URI:** `https://itam.bobmoore.com/api/auth/callback`
- **Front-channel logout URL:** `https://itam.bobmoore.com/login`
- In `config/app.env`: `APP_BASE_URL=https://itam.bobmoore.com`

## Troubleshooting

| Symptom | Fix |
|---|---|
| `502.3` / `error has occurred while processing the request` | ARR proxy not enabled (step 1), or the container isn't up — check `curl http://127.0.0.1:4000/api/health` on the host. |
| `404` from IIS, not the app | URL Rewrite module missing, or `web.config` not in the site's physical path. |
| Cert warning in browser | Wrong cert bound, or hostname mismatch — the cert CN/SAN must include `itam.bobmoore.com`. |
| Login loop | `APP_BASE_URL` or the Entra redirect URI doesn't exactly match `https://itam.bobmoore.com`. |
| Large CSV import rejected (`413`) | Raise `maxAllowedContentLength` in `web.config`. |
