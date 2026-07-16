# AWS EC2 Deployment Checklist — VSP Phone v4 RC1

| Field | Value |
|-------|-------|
| **Release** | `v4.0.0-rc1` |
| **Branch** | `release/v4.0.0-rc1` |
| **Commit** | `824d619d04d4fb713ee3a86dccb1b06126cb1170` |
| **Tag** | `v4.0.0-rc1` |
| **Host (current staging/prod EC2)** | `ubuntu@32.196.41.160` → `/opt/vsp-phone-v4` |
| **Audience** | Platform Ops |
| **Scope** | Deploy frozen RC1 only — no feature work |

This checklist is the single command sequence to deploy RC1 safely on AWS EC2.
Related: [ROLLBACK.md](./ROLLBACK.md), `docs/13-production-validation/10-extension-first-ec2-deploy.md`, `docs/07-deployment/ENVIRONMENT.md`.

---

## 0. Mandatory preflight (do not skip)

Abort deploy if any item fails.

### 0.1 Confirm release artifact

```bash
ssh ubuntu@32.196.41.160
cd /opt/vsp-phone-v4

git fetch --tags origin
git checkout release/v4.0.0-rc1
git pull --ff-only origin release/v4.0.0-rc1
git checkout v4.0.0-rc1   # detached at tag, or stay on branch tip

git rev-parse HEAD
# MUST equal: 824d619d04d4fb713ee3a86dccb1b06126cb1170

git describe --tags --exact-match HEAD
# MUST equal: v4.0.0-rc1
```

### 0.2 Confirm production database target (critical)

**Canonical RC1 DB (Extension-First):**

| Field | Required value |
|-------|----------------|
| `DATABASE_HOST` | `postgres` (container `vsp-postgres`) |
| `POSTGRES_APP_DB` | `vsp_phone_v4` |
| `POSTGRES_USER` | (from `.env`) |
| `POSTGRES_PASSWORD` | (from `.env`) |

```bash
grep -E '^(DATABASE_HOST|POSTGRES_APP_DB|POSTGRES_USER|DATABASE_URL)=' .env

# Live tenants must be on vsp_phone_v4 / vsp-postgres
docker exec vsp-postgres psql -U vsp -d vsp_phone_v4 -c \
  "SELECT COUNT(*) AS tenants FROM tenants WHERE deleted_at IS NULL;"
```

**Do not** point the v4 API at:

- `DATABASE_HOST=vsp-voip-postgres-1`
- `POSTGRES_APP_DB=vsp_voip` (legacy v3 schema)

Ignore `static/runtime-verification/EC2_DEPLOY_RUNBOOK.md` if it still references `vsp_voip` — canonical source is `docs/13-production-validation/10-extension-first-ec2-deploy.md`.

### 0.3 Confirm secrets and security flags

```bash
# Required present and non-empty
for k in JWT_SECRET TELECOM_SERVICE_AUTH_TOKEN TELNYX_WEBHOOK_SECRET \
         TLS_ENABLED BACKUP_LOCATION SECURITY_ENFORCE_TELECOM \
         NEXT_PUBLIC_API_URL CORS_ORIGINS; do
  echo -n "$k="
  grep -E "^${k}=" .env | cut -d= -f2- | sed 's/./*/g'
done

# Must be production
grep -E '^(NODE_ENV|VSP_ENV|TLS_ENABLED|SWAGGER_ENABLED|SECURITY_ENFORCE_TELECOM)=' .env

# Expected:
# NODE_ENV=production
# VSP_ENV=production
# TLS_ENABLED=true
# SECURITY_ENFORCE_TELECOM=true
# SWAGGER_ENABLED=false   (or unset; prod compose defaults false)
```

**Must NOT be set in production `.env`:**

```bash
grep -E '^(DEV_AUTH_|DEV_JWT_SECRET)' .env && echo "FAIL: DEV_* present" || echo "OK: no DEV_AUTH / DEV_JWT_SECRET"
```

**Telnyx (required for live DID ops):**

```bash
grep -E '^(TELNYX_API_KEY|VSP_PLATFORM_INVENTORY_TENANT_ID)=' .env | sed 's/=.*/=***/'
```

### 0.4 Admin BFF URL (TLS-aware)

API listens with TLS on `:3000` in production. Nginx proxies `https://127.0.0.1:3000`.

```bash
grep -E '^(API_INTERNAL_URL|NEXT_PUBLIC_API_URL)=' .env
```

| Variable | Recommended RC1 value |
|----------|------------------------|
| `NEXT_PUBLIC_API_URL` | `https://api.vspphone.com/api` (build-time ARG — rebuild admin after change) |
| `API_INTERNAL_URL` | Prefer Docker DNS HTTP if API also serves cleartext on the compose network, **or** `https://api.vspphone.com/api` if BFF cannot complete TLS to `http://api:3000`. |

After admin is up, verify BFF:

```bash
curl -sk https://admin.vspphone.com/api/health
# Platform login via browser must reach API (no anonymous 200 on protected BFF routes)
```

### 0.5 SSL certificates

```bash
sudo certbot certificates
sudo nginx -t

# Expiry > 30 days for:
# api.vspphone.com, admin.vspphone.com, app.vspphone.com, tenant.vspphone.com
```

### 0.6 Pre-deploy backup (mandatory)

```bash
sudo mkdir -p /opt/vsp-phone-v4/backups /opt/vsp-phone-v4/backups/env
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

# .env backup (secrets — restrict permissions)
sudo cp -a /opt/vsp-phone-v4/.env "/opt/vsp-phone-v4/backups/env/.env.${STAMP}"
sudo chmod 600 "/opt/vsp-phone-v4/backups/env/.env.${STAMP}"

# PostgreSQL dump (compose postgres / vsp_phone_v4)
docker exec vsp-postgres pg_dump -U vsp -d vsp_phone_v4 \
  | gzip -c > "/opt/vsp-phone-v4/backups/pre-rc1-${STAMP}-vsp_phone_v4.sql.gz"

# Uploads / branding
sudo tar -czf "/opt/vsp-phone-v4/backups/pre-rc1-${STAMP}-uploads.tgz" \
  -C /opt/vsp-phone-v4 data/branding 2>/dev/null || true

# Record prior images / commit
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep vsp > \
  "/opt/vsp-phone-v4/backups/pre-rc1-${STAMP}-images.txt" || true
git rev-parse HEAD | tee "/opt/vsp-phone-v4/backups/pre-rc1-${STAMP}-commit.txt"

ls -lah /opt/vsp-phone-v4/backups/pre-rc1-${STAMP}*
```

Optional full stack helper (uses compose postgres service name `postgres`):

```bash
BACKUP_DIR=/opt/vsp-phone-v4/backups \
  POSTGRES_USER=vsp POSTGRES_DB=vsp_phone_v4 \
  bash scripts/ops/backup-stack.sh
```

---

## 1. Environment audit reference

### 1.1 Compose files used on EC2

```bash
export COMPOSE="docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.host-db.yml \
  --env-file .env"

export API_DOCKER_TARGET=production
export ADMIN_DOCKER_TARGET=production
```

Omit `docker-compose.ec2-legacy-db.yml` unless intentionally joining `vsp-voip_default` (not for RC1 v4 DB).

### 1.2 Required production variables (checklist)

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | Yes | `production` |
| `VSP_ENV` | Yes | `production` |
| `JWT_SECRET` | Yes | Startup fail if missing |
| `TELECOM_SERVICE_AUTH_TOKEN` | Yes | Startup fail if missing |
| `TELNYX_WEBHOOK_SECRET` | Yes | Startup fail if missing |
| `TLS_ENABLED` | Yes | Must be `true` |
| `DATABASE_URL` / host-db vars | Yes | Via compose override |
| `REDIS_URL` | Yes | Compose sets `redis://redis:6379` |
| `BACKUP_LOCATION` | Yes | Production config validator |
| `SECURITY_ENFORCE_TELECOM` | Yes | Must be `true` |
| `CORS_ORIGINS` | Yes | Admin/app/tenant HTTPS origins |
| `NEXT_PUBLIC_API_URL` | Yes | Build-time for admin |
| `API_INTERNAL_URL` | Yes | Admin BFF runtime |
| `TELNYX_API_KEY` | Strongly | Live inventory |
| `VSP_PLATFORM_INVENTORY_TENANT_ID` | Strongly | Platform DID tenant |
| `SWAGGER_ENABLED` | Should be false | Prod compose default `false` |
| `RTPENGINE_ADVERTISE` | Ops | Public media IP / hostname |
| `SIP_PLATFORM_DOMAIN` | Ops | SIP realm |
| `WEBRTC_WSS_URL` | Ops | Softphone |

**Repo note:** `.env.production.template` / `.env.optional.template` are matched by `.gitignore` (`.env.*`) and are **not** in git. Use `docs/07-deployment/ENVIRONMENT.md` + `.env.example` + this checklist. Do not overwrite an existing EC2 `.env`.

### 1.3 Stack components

| Component | Artifact | Health |
|-----------|----------|--------|
| API | `infrastructure/docker/Dockerfile.api` → `production` | `GET /api/health`, `/api/ready` |
| Admin / Tenant / Ops portals | `Dockerfile.admin` → `production` | `GET /api/health` on `:3001` |
| PostgreSQL | `postgres:16-alpine` | `pg_isready` |
| Redis | `redis:7-alpine` AOF | `redis-cli ping` |
| Kamailio | `Dockerfile.kamailio` | `/healthcheck.sh` |
| RTPengine | `Dockerfile.rtpengine` | `/healthcheck.sh` |
| Nginx | `infrastructure/nginx/vsp-phone-v4.conf` | `nginx -t` + HTTPS curl |
| SSL | Let's Encrypt via certbot | `certbot certificates` |

---

## 2. Deployment sequence

### 2.1 Export compose helpers

```bash
cd /opt/vsp-phone-v4

export COMPOSE="docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.host-db.yml \
  --env-file .env"

export API_DOCKER_TARGET=production
export ADMIN_DOCKER_TARGET=production
```

### 2.2 Preferred: scripted deploy (api + admin)

```bash
sudo bash scripts/platform/ec2-deploy-extension-first.sh
```

This script:

1. Refuses to run without `.env` (does not overwrite it)
2. Builds `api` + `admin` production targets (`--no-cache`)
3. Ensures Redis healthy
4. Recreates api/admin with `--no-deps` (avoids accidental empty postgres)
5. Waits for `https://127.0.0.1:3000/api/health`
6. Runs `prisma migrate deploy`
7. Writes log under `static/runtime-verification/deployment-*.log`

### 2.3 Manual equivalent (if not using the script)

```bash
$COMPOSE build --no-cache api admin
$COMPOSE up -d redis
$COMPOSE up -d postgres   # only if using compose postgres for vsp_phone_v4
$COMPOSE up -d --force-recreate --no-deps api admin

# Wait for API TLS health
for i in $(seq 1 40); do
  curl -sk https://127.0.0.1:3000/api/health | grep -q '"status":"ok"' && break
  sleep 5
done
```

### 2.4 Prisma generate + migrations

- **Generate:** runs at image build (`Dockerfile.api` `npx prisma generate`).
- **Migrate deploy:**

```bash
$COMPOSE exec -T api npx prisma migrate deploy --schema=/app/prisma/schema.prisma
```

RC1 is schema-frozen at tag; migrate should be a no-op if already applied. Confirm:

```bash
docker exec vsp-postgres psql -U vsp -d vsp_phone_v4 -c \
  "SELECT migration_name, finished_at, rolled_back_at
   FROM _prisma_migrations
   ORDER BY finished_at DESC NULLS LAST
   LIMIT 15;"
```

### 2.5 Telecom plane

```bash
$COMPOSE up -d rtpengine kamailio

$COMPOSE ps
curl -sk https://127.0.0.1:3000/api/health/kamailio
curl -sk https://127.0.0.1:3000/api/health/rtpengine
```

### 2.6 Nginx (only if config changed)

```bash
sudo bash infrastructure/nginx/deploy-nginx.sh
sudo systemctl reload nginx
```

### 2.7 Restart policies (expected)

| Service | Policy (prod overlay / base) |
|---------|------------------------------|
| postgres, redis, kamailio, rtpengine, minio | `always` / `unless-stopped` |
| api, admin | `unless-stopped` (base) |

```bash
$COMPOSE ps
docker inspect vsp-api --format '{{.HostConfig.RestartPolicy.Name}}'
docker inspect vsp-kamailio --format '{{.HostConfig.RestartPolicy.Name}}'
```

### 2.8 Startup order (depends_on)

1. `postgres` healthy → (api when not using host-db override)
2. `redis` healthy → api
3. `api` healthy/started → admin
4. `rtpengine` started + `redis` healthy + `api` started → kamailio

Always use `--no-deps` when recreating api/admin against an existing DB volume.

---

## 3. Post-deploy verification

### 3.1 Health endpoints

```bash
curl -sk https://127.0.0.1:3000/api/health | jq .
curl -sk https://127.0.0.1:3000/api/ready | jq .
curl -sk https://api.vspphone.com/api/health | jq .
curl -sk https://api.vspphone.com/api/ready | jq .
curl -sk https://api.vspphone.com/api/health/postgres | jq .
curl -sk https://api.vspphone.com/api/health/redis | jq .
curl -sk https://api.vspphone.com/api/health/kamailio | jq .
curl -sk https://api.vspphone.com/api/health/rtpengine | jq .
curl -sk http://127.0.0.1:3001/api/health
```

Expected API liveliness: `"status":"ok"`, `"mode":"remediation-complete"`.

### 3.2 Security smoke

```bash
# Swagger must not be exposed
curl -sk -o /dev/null -w "%{http_code}\n" https://api.vspphone.com/api/docs
# Expect 404 (or non-200 HTML docs)

# Anonymous protected route must be 401
curl -sk -o /dev/null -w "%{http_code}\n" \
  https://api.vspphone.com/api/v1/platform/tenants
```

### 3.3 Portal smoke (browser)

| URL | Check |
|-----|-------|
| `https://admin.vspphone.com/login` | Platform login |
| `https://app.vspphone.com/login` | Ops login |
| `https://tenant.vspphone.com/login` | Tenant login |
| Extension Hub | Loads for pilot tenant |
| DID Assign | Auto-provisions extension (RC1) |

### 3.4 Logging

```bash
# Docker json-file logs (max-size 10m × 3)
$COMPOSE logs --tail=100 api
$COMPOSE logs --tail=100 admin
$COMPOSE logs --tail=100 kamailio
$COMPOSE logs --tail=100 rtpengine
$COMPOSE logs --tail=50 postgres redis

sudo journalctl -u nginx -n 50 --no-pager
sudo tail -n 50 /var/log/nginx/error.log

# Kamailio / RTPengine volume logs (compose volumes)
docker volume ls | grep -E 'kamailio|rtpengine'
```

### 3.5 Record deployed commit

```bash
git rev-parse HEAD | tee static/runtime-verification/deployed-commit.txt
echo "Deployed $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a static/runtime-verification/deployed-commit.txt
```

---

## 4. Backup verification (ops)

| Item | Command / location | Status gate |
|------|-------------------|-------------|
| PostgreSQL dump | §0.6 + cron below | Pre-deploy file exists and non-zero size |
| Restore procedure | See [ROLLBACK.md](./ROLLBACK.md) §Database | Dry-run `gunzip -t` on dump |
| Uploads | `data/branding` tarball | Present if branding used |
| `.env` | `backups/env/.env.*` mode `600` | Present |
| App readiness marker | `GET /api/v1/production/backup/readiness` (auth) | `BACKUP_LOCATION` set |

**Schedule daily backup (example cron as root):**

```bash
sudo crontab -e
# Daily 02:15 UTC
15 2 * * * cd /opt/vsp-phone-v4 && \
  docker exec vsp-postgres pg_dump -U vsp -d vsp_phone_v4 | gzip -c \
  > /opt/vsp-phone-v4/backups/daily-$(date -u +\%Y\%m\%d).sql.gz \
  && find /opt/vsp-phone-v4/backups -name 'daily-*.sql.gz' -mtime +14 -delete
```

---

## 5. Security audit gates

| Control | Expected |
|---------|----------|
| Production secrets | `JWT_SECRET`, `TELECOM_SERVICE_AUTH_TOKEN`, `TELNYX_WEBHOOK_SECRET` set |
| JWT | Custom HS256 via `JWT_SECRET` (not `DEV_JWT_SECRET`) |
| Cookies / BFF | HTTPS portals only; no `DEV_AUTH_*` |
| CORS | `CORS_ORIGINS` lists `https://admin|app|tenant.vspphone.com` |
| Rate limiting | `AdminRateLimitGuard` / `AuthRateLimitGuard` / Redis-backed scopes |
| HTTPS | Nginx LE + API `TLS_ENABLED=true` |
| Swagger | `SWAGGER_ENABLED=false` |
| DEV_AUTH | Unset (not fail-closed by validator — **manual check required**) |
| Postgres/Redis ports | Prefer no public bind; SG/firewall restrict 5432/6379 |

---

## 6. Monitoring checklist

| Signal | How |
|--------|-----|
| API logs | `docker logs vsp-api` (`LOG_FORMAT=json`) |
| Kamailio | `docker logs vsp-kamailio` + `kamailio_logs` volume |
| RTPengine | `docker logs vsp-rtpengine` + `rtpengine_logs` volume |
| Nginx | `/var/log/nginx/*`, `journalctl -u nginx` |
| Docker | `docker ps`, compose health status |
| Optional metrics | `docker-compose.monitoring.yml` (Prometheus/Grafana) if enabled |

---

## 7. Go / No-Go

Deploy only when:

- [ ] HEAD = `824d619` / tag `v4.0.0-rc1`
- [ ] Pre-deploy DB + `.env` backup completed
- [ ] `.env` has no `DEV_AUTH_*` / `DEV_JWT_SECRET`
- [ ] DB target = `postgres` / `vsp_phone_v4`
- [ ] SSL valid > 30 days
- [ ] `/api/health` and `/api/ready` OK after deploy
- [ ] Portals login OK
- [ ] Kamailio + RTPengine health not `down`
- [ ] Rollback path reviewed ([ROLLBACK.md](./ROLLBACK.md))

If any gate fails → **stop** and follow [ROLLBACK.md](./ROLLBACK.md).

---

## 8. After deploy (ops, not Cursor)

1. Test with real phones and real DIDs
2. Fix only production-critical bugs
3. Collect pilot customer feedback
4. Do not request feature development against this tag
