# RC1 Release Checklist

| Field | Value |
|-------|-------|
| **Version** | v4.0.0-rc1 |
| **Release commit** | Branch tip of `release/v4.0.0-rc1` (supersedes `ee3f990`) |
| **Branch** | `release/v4.0.0-rc1` |
| **Sign-off** | Platform Engineering + Ops |

Mark `[x]` when verified on **staging**.

---

## Backend

- [ ] `npx nx run api:build` — PASS
- [ ] `GET /api/health` → 200, `status: ok`
- [ ] `GET /api/ready` → 200 (when stack up)
- [ ] `GET /api/v1/cutover/readiness` reviewed
- [ ] `JWT_SECRET` set; no `DEV_AUTH_*`
- [ ] `TELECOM_SERVICE_AUTH_TOKEN` set
- [ ] `SECURITY_ENFORCE_TELECOM=true`
- [ ] `SWAGGER_ENABLED=false`
- [ ] RBAC enforced on platform + tenant APIs

## Frontend

- [ ] `npx nx run admin:build` — PASS
- [ ] Platform login works
- [ ] Tenant login works
- [ ] No console errors on Dashboard (platform + tenant)
- [ ] Provisioning wizard completes (staging data)
- [ ] Tenant Detail tabs sync after provision

## Database

- [ ] `npx prisma migrate deploy` (if upgrading)
- [ ] `scripts/platform/db-integrity-verification.sql` — zero critical issues
- [ ] Backup verified before deploy

## Redis

- [ ] Instance reachable
- [ ] Session revocation works (logout invalidates token)
- [ ] Persistence configured (AOF/RDB)

## Docker

- [ ] Images build for `api`, `admin`, `kamailio`, `rtpengine`
- [ ] Rolling deploy tested
- [ ] Health checks wired to load balancer

## Environment

- [ ] `.env` matches `docs/14-rc1/ENVIRONMENT-VARIABLES.md`
- [ ] Portal hostnames: `admin.*`, `app.*`, `tenant.*`
- [ ] `NEXT_PUBLIC_API_URL` correct per portal

## SSL

- [ ] API TLS valid > 30 days
- [ ] Admin/Tenant HTTPS valid
- [ ] SIP TLS / WSS certificates valid

## Health endpoints

- [ ] `/api/health`
- [ ] `/api/ready`
- [ ] `/api/health/kamailio`
- [ ] `/api/health/rtpengine`
- [ ] `/api/health/redis`

## RBAC

- [ ] Platform user without permission gets 403 on protected APIs
- [ ] Tenant A token cannot access Tenant B resources
- [ ] Super admin cross-tenant reads work where intended

## Provisioning

- [ ] Full wizard: tenant → numbers → review → execute → complete
- [ ] Partial failure (retry) tested
- [ ] DID inventory updates without browser hard refresh
- [ ] `node scripts/platform/verify-extension-first-runtime.cjs` — PASS

## Tenant Portal

- [ ] Extension Hub loads
- [ ] Configure extension
- [ ] Phone Setup Center + QR generation
- [ ] Desk phone provisioning URL reachable
- [ ] Voicemail accessible
- [ ] Call handling routes configurable

## Platform Portal

- [ ] Dashboard operational sections
- [ ] Tenants list + detail
- [ ] DID Inventory
- [ ] Provisioning workspace
- [ ] System health / audit

## Browser QA

- [ ] Chrome
- [ ] Edge
- [ ] Firefox
- [ ] Responsive (tablet/mobile)
- [ ] Dark mode (if enabled)
- [ ] Keyboard navigation basics

## Security (pre-production)

- [x] BFF routes require JWT + ops/platform permission (RC1-001 code fix)
- [x] Local BFF verify: anonymous 401, tenant 403 (`verify-rc1-final.cjs` 2026-07-13)
- [ ] Staging admin redeployed at release tip (supersedes `ee3f990`) — `admin.vspphone.com` BFF returns 502 until deploy
- [ ] `verify-bff-security.cjs` PASS on staging admin URL
- [ ] Platform admin BFF → 200 verified with platform JWT
- [ ] Telnyx webhook secret configured on production host

## Tenant Portal (verified 2026-07-13)

- [x] API: login, hub, stats, DIDs, voicemail, routing, CDR, recordings (staging)
- [x] Chromium: login smoke, Extension Hub, rename, QR, desk phone fields
- [ ] Edge / Firefox
- [ ] Responsive 1920 / 1440 / 1280 / 1024 / 768 manual pass

## Platform Portal

- [ ] Login + dashboard + tenants + DID inventory + provisioning wizard
- [ ] Provisioning batches: 1 / 5 / 25 DIDs
- [ ] Requires `PLATFORM_EMAIL` / `PLATFORM_PASSWORD` in environment

## Database

- [ ] `run-db-integrity.cjs` or SQL script on **staging** PostgreSQL — all counts zero

## Documentation

- [ ] `docs/14-rc1/` package reviewed
- [ ] Runbook and rollback understood by on-call
- [ ] Known issues acknowledged by stakeholders

---

**RC1 approval requires all Critical and High items checked.**
