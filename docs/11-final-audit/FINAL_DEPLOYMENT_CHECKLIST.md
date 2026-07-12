# Final Deployment Checklist — VSP Phone v4 (Post-Remediation)

| Field | Value |
|-------|-------|
| **Document ID** | REMED-004 |
| **Date** | 2026-07-09 |
| **Version** | 4.0.0-rc1 |
| **Audience** | Platform operators, NOC, Super Admin |

---

## Pre-deploy validation

- [ ] Run `npm ci` — **PASSED**
- [ ] Run `npm run build` — **PASSED** (full monorepo)
- [ ] Run `npm run telecom:validate:remediation` — **PASSED**
- [ ] Run `npm run telecom:validate:phase20` — **PASSED** (included in remediation validator)
- [ ] Export config snapshot: `GET /api/v1/production/config/export`
- [ ] Store snapshot in secure change-management record

---

## Environment — API (production)

| Variable | Required | Notes |
|----------|----------|-------|
| `VSP_ENV` | ✅ | `production` |
| `JWT_SECRET` | ✅ | Strong random secret |
| `TELECOM_SERVICE_AUTH_TOKEN` | ✅ | Shared with Kamailio; **never commit** |
| `TELNYX_WEBHOOK_SECRET` | ✅ | Telnyx webhook HMAC |
| `TELNYX_API_KEY` | ✅ | Telnyx REST (carrier-admin inventory) |
| `VSP_PLATFORM_INVENTORY_TENANT_ID` | ✅ | Platform tenant for unassigned numbers |
| `NEXT_PUBLIC_API_URL` | ✅ | Admin build-time API URL (`/api` suffix) |
| `API_INTERNAL_URL` | Recommended | Admin BFF server-side proxy (Compose: `http://api:3000/api`) |
| `TLS_ENABLED` | ✅ | `true` |
| `TLS_API_CERT_FILE` / `TLS_API_KEY_FILE` | ✅ | Valid certificates |
| `DATABASE_URL` | ✅ | Primary PostgreSQL |
| `REDIS_URL` | ✅ | Redis with AOF or RDB persistence |
| `SECURITY_ENFORCE_TELECOM` | ✅ | Defaults `true` in production; verify not overridden |
| `BACKUP_LOCATION` | ✅ | Writable path or mount |
| `BACKUP_SCHEDULE` | ✅ | Cron/k8s schedule documented |
| `BACKUP_POSTGRES_HOOK_CMD` | Optional | Vendor-neutral backup script |
| `READINESS_STRICT` | Recommended | `true` for multi-node clusters |

---

## Environment — Kamailio (production)

| Variable | Required | Notes |
|----------|----------|-------|
| `TELECOM_SERVICE_AUTH_TOKEN` | ✅ | Must match API |
| `KAMAILIO_REQUIRE_SERVICE_AUTH` | ✅ | `true` in production |
| `KAMAILIO_USRLOC_PERSISTENCE` | Recommended | `postgres` for restart-safe registrations |
| `KAMAILIO_USRLOC_DB_URL` | If postgres | Apply `infrastructure/kamailio/usrloc-schema.sql` first |
| `RTPENGINE_HOST` | ✅ | Reachable from Kamailio |

Verify entrypoint logs:

```
[kamailio] service auth token injected for NestJS HTTP client
[kamailio] usrloc persistence=postgres
[kamailio] configuration OK
```

---

## Security

- [ ] `TELECOM_SERVICE_AUTH_TOKEN` set on API **and** Kamailio (C-01)
- [ ] `SECURITY_ENFORCE_TELECOM=true` confirmed (H-04)
- [ ] Super Admin role (`platform:super_admin`) assigned only to authorized operators
- [ ] Tenant Admin / User roles configured in Prisma `RolePermission`
- [ ] Provisioning firmware URL restricted by network ACL or TLS edge (L-07)

---

## Backup & DR (C-02)

- [ ] `BACKUP_LOCATION` configured and writable
- [ ] `POST /api/v1/ha/backup/execute` succeeds (or hook command tested)
- [ ] `GET /api/v1/ha/backup/status` shows `redisPersistence.ok: true`
- [ ] `POST /api/v1/ha/backup/restore-readiness` returns `ok: true`
- [ ] External off-site copy of backups documented (operator responsibility)

---

## Migration (if applicable)

- [ ] Phase 19 dry-run completed for pilot tenant
- [ ] Redis staging import verified
- [ ] Production import (optional): `productionImport=true` + `productionImportConfirm=I_CONFIRM_PRODUCTION_IMPORT`
- [ ] Super Admin JWT used for import API
- [ ] Rollback metadata retained in migration batch record

---

## Cutover gates

- [ ] `GET /api/v1/cutover/readiness` → `ready: true`
- [ ] Checks include: `kamailio_service_auth`, `backup_readiness`, `configuration`
- [ ] `POST /api/v1/cutover/smoke-test` — 16 tests pass
- [ ] Complete `docs/10-production/go-live-checklist.md`

---

## Health endpoints

| Endpoint | Expected |
|----------|----------|
| `GET /api/health` | `mode: remediation-complete` |
| `GET /api/ready` | `status: ok` with postgres/redis/kamailio/rtpengine up |
| `GET /api/v1/ha/kamailio/persistence` | `serviceAuthConfigured: true`, `mode: postgres` (prod) |
| `GET /api/v1/telecom/health` | `mode: remediation-complete` |

---

## Post-cutover verification

- [ ] SIP phone registration succeeds
- [ ] Extension-to-extension call
- [ ] Inbound/outbound PSTN call
- [ ] WebRTC enroll + browser call
- [ ] Grandstream provisioning enroll
- [ ] Queue/IVR call reaches APP_MEDIA target (if enabled)
- [ ] Monitor audit logs for `permissionDenied` anomalies

---

## Rollback

- [ ] Rollback runbook reviewed: `docs/10-production/rollback-runbook.md`
- [ ] Rollback is **non-destructive** — no automatic data deletion
- [ ] DNS/SIP trunk revert plan documented

---

## Related documents

- [PRODUCTION_APPROVAL.md](./PRODUCTION_APPROVAL.md)
- [REMEDIATION_REPORT.md](./REMEDIATION_REPORT.md)
- [docs/10-production/go-live-checklist.md](../10-production/go-live-checklist.md)
