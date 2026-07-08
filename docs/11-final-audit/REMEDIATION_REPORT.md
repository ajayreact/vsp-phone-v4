# Engineering Remediation Report — VSP Phone v4

| Field | Value |
|-------|-------|
| **Document ID** | REMED-001 |
| **Date** | 2026-07-08 |
| **Sprint** | Final Engineering Audit — Findings Closure |
| **Validation** | `npm run telecom:validate:remediation` |

---

## Executive summary

This sprint addressed all **Critical** and **High** findings from the Final Engineering Audit without modifying the Prisma schema, database migrations, or core telecom architecture. No new PBX features were added.

**Result:** All Critical and High findings are **Resolved** or documented as **Accepted Risk** / **Deferred** with justification. Production deployment scope is unblocked for pilot cutover.

---

## Critical findings (Priority 1)

### C-01 — Service Authentication ✅ Resolved

| Item | Implementation |
|------|----------------|
| Kamailio HTTP header | `route[NESTJS_HTTP_HDRS]` sets `X-VSP-Service-Auth` on all NestJS HTTP calls |
| No hard-coded secrets | Token injected via `docker-entrypoint.sh` from `TELECOM_SERVICE_AUTH_TOKEN` |
| Startup validation | `ProductionConfigValidatorService` + `KamailioPersistenceService.validateProduction()` |
| Health / cutover | `GET /api/v1/ha/kamailio/persistence`, cutover readiness `kamailio_service_auth` check |
| Documentation | `.env.example`, `FINAL_DEPLOYMENT_CHECKLIST.md` |

### C-02 — Backup & Disaster Recovery ✅ Resolved

| Item | Implementation |
|------|----------------|
| PostgreSQL backup hook | `BackupOrchestrationService.executeBackup()` — `pg_dump` or `BACKUP_POSTGRES_HOOK_CMD` |
| Redis persistence verify | Redis `INFO` AOF/RDB check |
| Backup verification | Artifact scan in `BACKUP_LOCATION` |
| Restore verification | `POST /api/v1/ha/backup/restore-readiness` (non-destructive) |
| Status reporting | `GET /api/v1/ha/backup/status`, production `GET /api/v1/production/backup/readiness` |

Vendor-neutral: operators supply `BACKUP_LOCATION` and optional hook command; no cloud vendor SDK.

---

## High findings (Priority 2)

### H-01 — APP_MEDIA Integration ✅ Resolved

Kamailio `route[APP_MEDIA_RELAY]` handles queue, IVR, conference, park, and voicemail media targets from routing API responses. Integrated in `route[INVITE]` before FORK fallback.

### H-02 — Routing Continuation ✅ Resolved

In-dialog `INFO` triggers `route[ROUTING_CONTINUE]` → `POST /api/v1/telecom/routing/continue`. Handles REJECT, APP_MEDIA, BRIDGE_CARRIER, and FORK responses.

### H-03 — RBAC Enforcement ✅ Resolved

`PermissionsGuard` + `@RequirePermission()` applied to provisioning, recording, and presence admin controllers. Super Admin guard retained on migration/cutover APIs. Service plane uses `TelecomServiceAuthGuard`.

### H-04 — Telecom Security ✅ Resolved

`SECURITY_ENFORCE_TELECOM` defaults to `true` when `VSP_ENV=production|prod`. Development may override explicitly. Production config validator enforces the flag.

### H-05 — Migration Production Import ✅ Resolved (scoped)

Optional `productionImport=true` with confirmation phrase `I_CONFIRM_PRODUCTION_IMPORT`. Super Admin only. Transactional Prisma import for **tenant** and **queue** entities with per-entity audit logging. Dry-run unchanged. Additional entity types deferred (see FINDINGS_MATRIX).

### H-06 — Kamailio Registration Persistence ✅ Resolved

Configurable `KAMAILIO_USRLOC_PERSISTENCE=memory|postgres`. Entrypoint injects `db_mode` and `db_url`. Schema in `infrastructure/kamailio/usrloc-schema.sql`. Health via `GET /api/v1/ha/kamailio/persistence`.

---

## Medium findings (Priority 3)

| ID | Status | Notes |
|----|--------|-------|
| M-01 | Deferred | OpenTelemetry/Jaeger — ADR-016 partial; out of remediation scope |
| M-02 | Deferred | Loki/Grafana/Alertmanager deployment — infrastructure follow-up |
| M-03 | Resolved | `/api/ready` uses application-level probes via `EnterpriseHealthService` |
| M-04 | Resolved | `READINESS_STRICT` gates on Kamailio/RTPengine cluster node registries |
| M-05 | Deferred | Read replica probed in HA health; query routing not in scope |
| M-06 | Accepted Risk | Recording policy in API; RTPengine media capture documented limitation |
| M-07 | Resolved | Restore validation checks known release phases |
| M-08 | Accepted Risk | Empty domain module stubs — schema frozen; no expansion permitted |
| M-09 | Resolved | `ShutdownCoordinatorService` invokes `GracefulShutdownService.flush()` |
| M-10 | Resolved | `READINESS_STRICT` implemented in `HaHealthService.isReadyForTraffic()` |
| L-01 | Resolved | Swagger version `1.0.0-remediation` |
| L-02 | Resolved | Shared `tcp-probe.ts` utility |
| L-03 | Deferred | `OBSERVABILITY_REDIS_KEYS` retained as key layout documentation |
| L-04–L-06 | Deferred | Naming consistency — non-blocking |
| L-07 | Accepted Risk | Firmware download — document network ACL in deployment checklist |
| L-08 | Deferred | Software Architecture Document update — separate doc sprint |
| L-09 | Deferred | Prisma gauge refresh optimization — performance follow-up |
| L-10 | Deferred | SIP REFER transfer — pre-existing deferral |

---

## Engineering freeze compliance

| Constraint | Status |
|------------|--------|
| Prisma schema unchanged | ✅ Verified by validator |
| No new migrations | ✅ Verified by validator |
| RTPengine architecture | ✅ Preserved |
| WebRTC / Telnyx architecture | ✅ Unchanged |
| Existing telecom API contracts | ✅ Preserved |
| No new PBX features | ✅ Remediation-only changes |

---

## Validation

```bash
npm run telecom:validate:remediation
```

Runs: frozen checks, remediation static assertions, `nx build api`, `nx lint api`, phase20 regression chain.

---

## Related documents

- [FINDINGS_MATRIX.md](./FINDINGS_MATRIX.md)
- [PRODUCTION_APPROVAL.md](./PRODUCTION_APPROVAL.md)
- [FINAL_DEPLOYMENT_CHECKLIST.md](./FINAL_DEPLOYMENT_CHECKLIST.md)
- [PRODUCTION_READINESS_REPORT.md](./PRODUCTION_READINESS_REPORT.md)
