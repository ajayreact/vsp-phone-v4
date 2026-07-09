# Deployment Guide — VSP Phone v4

| Version | 4.0.0-rc1 |
|---------|-----------|

Deployment procedures for RC1 staging and production pilot environments.

---

## Prerequisites

- Docker and Docker Compose (recommended) or bare-metal with Node.js 22+
- PostgreSQL 16+, Redis 7+ with persistence
- TLS certificates for API, SIP, WSS, provisioning
- Secrets in sealed vault (never commit `.env`)

---

## Quick start (development)

```bash
cp .env.example .env
npm ci
npm run docker:core          # postgres + redis
npm run prisma:generate
npx nx serve api
npx nx dev admin
```

Full stack:

```bash
npm run docker:up
```

---

## RC1 staging deployment

### 1. Pre-deploy validation

```bash
npm ci
npm run build
npm run telecom:validate:remediation
```

### 2. Environment configuration

Copy `.env.example` → `.env` and set production-oriented values:

| Category | Key variables |
|----------|---------------|
| Profile | `VSP_ENV=production`, `NODE_ENV=production` |
| Secrets | `JWT_SECRET`, `TELECOM_SERVICE_AUTH_TOKEN`, `TELNYX_WEBHOOK_SECRET` |
| Database | `DATABASE_URL`, optional `DATABASE_READ_URL` |
| Redis | `REDIS_URL` |
| TLS | `TLS_ENABLED=true`, cert/key file paths |
| Security | `SECURITY_ENFORCE_TELECOM=true`, `KAMAILIO_REQUIRE_SERVICE_AUTH=true` |
| Backup | `BACKUP_LOCATION`, `BACKUP_SCHEDULE` |
| Kamailio | `KAMAILIO_USRLOC_PERSISTENCE=postgres`, `KAMAILIO_USRLOC_DB_URL` |

See [FINAL_DEPLOYMENT_CHECKLIST.md](../11-final-audit/FINAL_DEPLOYMENT_CHECKLIST.md).

### 3. Docker production overlay

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Targets: `API_DOCKER_TARGET=production`, `ADMIN_DOCKER_TARGET=production`

### 4. Database

```bash
npx prisma migrate deploy    # if migrations exist in deployment process
npx prisma generate
```

Kamailio usrloc (if postgres persistence):

```bash
psql $KAMAILIO_USRLOC_DB_URL -f infrastructure/kamailio/postgres/bootstrap-usrloc.sql
```

### 5. TLS certificates

```bash
npm run tls:validate
```

Development cert generation (lab only):

```bash
npm run tls:generate
```

### 6. Cutover readiness

```bash
curl -H "Authorization: Bearer $SUPER_ADMIN_JWT" \
  https://api.example.com/api/v1/cutover/readiness
```

Expected: `"ready": true`

### 7. Smoke tests

```bash
curl -X POST -H "Authorization: Bearer $SUPER_ADMIN_JWT" \
  https://api.example.com/api/v1/cutover/smoke-test
```

---

## Docker images

| Image | Dockerfile | Notes |
|-------|------------|-------|
| API | `infrastructure/docker/Dockerfile.api` | NestJS webpack bundle |
| Admin | `infrastructure/docker/Dockerfile.admin` | Next.js standalone |
| Kamailio | `infrastructure/docker/Dockerfile.kamailio` | Entrypoint injects auth + usrloc |
| RTPengine | `infrastructure/docker/Dockerfile.rtpengine` | Media anchoring |

Build context: repository root. See [infrastructure/docker/README.md](../../infrastructure/docker/README.md).

---

## Git release tagging

If git is not initialized, run before tagging:

```bash
git init
git add .
git commit -m "Release Candidate 1"
git tag v4.0.0-rc1
```

Record the commit SHA in `BUILD_GIT_COMMIT` / `RELEASE_NUMBER` environment variables at deploy time.

**Do not fabricate commit hashes.** Capture from `git rev-parse HEAD` after commit.

---

## Scaling notes

- **API:** Stateless; scale horizontally behind load balancer
- **Kamailio:** Use `KAMAILIO_USRLOC_PERSISTENCE=postgres` for restart-safe registrations
- **RTPengine:** Vertical scale or expand `RTPENGINE_PORT_MIN/MAX`
- **Redis:** Enable AOF; consider Sentinel for HA

---

## Rollback

Rollback is **non-destructive**. Follow [rollback-runbook.md](../10-production/rollback-runbook.md).

---

## Related documents

- [go-live-checklist.md](../10-production/go-live-checklist.md)
- [production-runbook.md](../10-production/production-runbook.md)
- [TROUBLESHOOTING.md](../10-production/TROUBLESHOOTING.md)
- [RELEASE_MANIFEST.md](../12-release/RELEASE_MANIFEST.md)
