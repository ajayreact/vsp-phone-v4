# Nginx — VSP Phone v4 RC1 reverse proxy

Operator-owned reverse proxy. The application stack listens on localhost; nginx terminates public TLS and proxies inward.

## RC1 upstream map

| Public host | nginx `proxy_pass` | Backend |
|-------------|-------------------|---------|
| `api.vspphone.com` | `http://127.0.0.1:3000` | NestJS API (HTTP; TLS at nginx) |
| `admin.vspphone.com` | `http://127.0.0.1:3001` | Platform Admin (`platform` portal) |
| `app.vspphone.com` | `http://127.0.0.1:3001` | Operations Center (`ops` portal) |
| `tenant.vspphone.com` | `http://127.0.0.1:3001` | Tenant Portal (`tenant` portal) |
| `prov.vspphone.com` | `https://127.0.0.1:3444` | NestJS prov-edge (`/health`, `/gs/{mac}/cfg.xml`) |
| `vspphone.com` / `www` | 301 → `app.vspphone.com` | — |

**Provisioning status “fetch failed”:** Platform Admin probes `GET {PROV_PUBLIC_BASE_URL}/health` (default `https://prov.vspphone.com/health`). That requires (1) DNS A for `prov.vspphone.com`, (2) this nginx vhost + LE cert, (3) API publishing `3444`. Path is `/health` — **not** `/api/health`.

**Single-container production:** One admin service on `:3001` serves all three hostnames. Portal selection is by **Host header** (`admin.*` → platform, `app.*` → ops, `tenant.*` → tenant). Do **not** set `NEXT_PUBLIC_PORTAL` in production `.env` unless running separate builds per portal.

**API hang / 504 on api.vspphone.com:** nginx uses `http://127.0.0.1:3000`. The API must listen **plain HTTP** (`TLS_ENABLED=false`, `TLS_TERMINATION=nginx`). If Nest still has HTTPS on :3000, HTTP clients hang (0 bytes). Fix: recreate API with `docker-compose.prod.yml` / `host-db` overlays (they hard-set nginx termination).

**Prov 504:** nginx proxies `https://127.0.0.1:3444`. If prov-edge never started (missing PEMs), connect times out (~10s) → 504. Run `bash scripts/platform/sync-le-prov-tls.sh` then recreate API.

**Conflicting server_name:** multiple files in `sites-enabled/` and `conf.d/` define the same hostnames. Keep **one** canonical file.

## Deploy on EC2

```bash
cd /opt/vsp-phone-v4
git fetch origin && git reset --hard origin/release/v4.0.0-rc1

sudo bash infrastructure/nginx/deploy-nginx.sh
```

## Manual audit

```bash
sudo grep -rn "server_name" /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d
sudo nginx -T 2>/dev/null | grep -E "server_name|proxy_pass|listen 443"
curl -sk https://127.0.0.1:3000/api/ready | jq .
curl -sk https://api.vspphone.com/api/ready | jq .
```

## AWS Security Group (inbound)

| Port | Purpose |
|------|---------|
| 443/tcp | nginx HTTPS (api, app, admin) |
| 80/tcp | HTTP → HTTPS redirect |
| 5060/5061 | SIP (Kamailio, not nginx) |
| 8443 | WSS (Kamailio, not nginx) |

## Files

| File | Purpose |
|------|---------|
| `vsp-phone-v4.conf` | Canonical single-file vhost config |
| `deploy-nginx.sh` | Backup, remove duplicates, install, reload |
