# RC1 Deployment Runbook

| Field | Value |
|-------|-------|
| **Version** | v4.0.0-rc1 |
| **Audience** | Platform Ops, Release Engineering |

## Prerequisites

- [ ] Git tag `v4.0.0-rc1` checked out
- [ ] `.env` populated from `.env.production.template` (no `DEV_AUTH_*` in production)
- [ ] `JWT_SECRET`, `TELECOM_SERVICE_AUTH_TOKEN`, `TELNYX_API_KEY` set
- [ ] `SECURITY_ENFORCE_TELECOM=true`, `SWAGGER_ENABLED=false`
- [ ] PostgreSQL and Redis reachable
- [ ] TLS certificates valid > 30 days

## Pre-deploy validation

```bash
npm ci
npx nx run api:build
npx nx run admin:build
npm run telecom:validate:remediation   # if available
```

Verify health before deploy:

```bash
curl -s https://<api-host>/api/health
# Expected: {"status":"ok","mode":"remediation-complete",...}
```

## Deploy sequence

### 1. Database (no schema changes in RC1)

RC1 is schema-frozen. Run migrations only if deploying from an older revision:

```bash
npx prisma migrate deploy
```

### 2. API

```bash
docker compose build api
docker compose up -d api
curl -s https://<api-host>/api/ready
```

### 3. Admin (Platform / Ops / Tenant portals)

```bash
docker compose build admin
docker compose up -d admin
```

Verify portal hostnames resolve:

| Hostname | Portal |
|----------|--------|
| `admin.<domain>` | Platform Admin |
| `app.<domain>` | Ops |
| `tenant.<domain>` | Tenant Portal |

### 4. Telecom stack

```bash
docker compose up -d kamailio rtpengine
curl -s https://<api-host>/api/health/kamailio
curl -s https://<api-host>/api/health/rtpengine
```

### 5. Post-deploy smoke

1. Platform login at `admin.<domain>/login`
2. Dashboard loads without console errors
3. Tenant list loads (`GET /v1/platform/tenants`)
4. Provisioning wizard opens at `/provisioning`
5. Tenant login at `tenant.<domain>/login`
6. Extension Hub loads

## Rollback

See [ROLLBACK-PLAN.md](./ROLLBACK-PLAN.md).

## Related

- Full cutover: `docs/10-production/production-runbook.md`
- Go-live checklist: `docs/10-production/go-live-checklist.md`
- Environment: [ENVIRONMENT-VARIABLES.md](./ENVIRONMENT-VARIABLES.md)
