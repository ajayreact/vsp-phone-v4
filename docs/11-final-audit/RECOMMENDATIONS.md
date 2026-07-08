# Recommendations — VSP Phone v4

| Field | Value |
|-------|-------|
| **Document ID** | AUDIT-008 |
| **Date** | 2026-07-08 |
| **Status** | Post-freeze maintenance backlog (no implementation in freeze) |

---

## Purpose

Recommendations only. **No code or architecture changes** are made as part of this audit per engineering freeze rules.

---

## Critical — before production traffic (P0)

### R-01: Configure Kamailio service authentication

**Issue:** C-01 / SL-01  
**Action:** Add `$http_req(hdr) = "X-VSP-Service-Auth: <token>"` to all Kamailio `http_client` requests in `kamailio.cfg` (auth, register, routing, call lifecycle, media lifecycle).  
**Owner:** Telecom Ops / Platform Ops  
**Effort:** Small (infrastructure config)  
**Note:** Kamailio cfg is frozen for this audit — this is an **operational deployment step** that must occur in the production environment configuration pipeline, not a codebase change during freeze.

### R-02: Establish external database backup

**Issue:** C-02 / PL-01  
**Action:** Deploy automated PostgreSQL backup (pg_dump or cloud-native) to `BACKUP_LOCATION`. Schedule per `BACKUP_SCHEDULE`. Include Redis RDB/AOF backup.  
**Owner:** Platform Ops / DBA  
**Effort:** Medium (infrastructure)

### R-03: Enable production security flags

**Issue:** H-04 / SL-03  
**Action:** Set in production environment:
- `SECURITY_ENFORCE_TELECOM=true`
- `MIGRATION_DEV_SUPER_ADMIN=false`
- `MIGRATION_REQUIRE_READINESS=true`
- `TELECOM_SERVICE_AUTH_TOKEN=<strong-random>`
**Owner:** Security / Platform Ops  
**Effort:** Small

---

## High — before full feature rollout (P1)

### R-04: Kamailio APP_MEDIA handler

**Issue:** H-01 / TL-01  
**Action:** Extend `route[INVITE]` in Kamailio to branch on `APP_MEDIA` action type — relay to media URI or invoke media application server. Requires post-freeze Kamailio change with ADR update.  
**Owner:** Telecom Architect  
**Effort:** Large

### R-05: Kamailio routing/continue integration

**Issue:** H-02 / TL-02  
**Action:** Add in-dialog HTTP callback (INFO/NOTIFY or timer-based) to POST `/api/v1/telecom/routing/continue` for queue/IVR/park progression.  
**Owner:** Telecom Architect  
**Effort:** Large

### R-06: Apply RBAC to admin controllers

**Issue:** H-03 / SL-02  
**Action:** Add `@UseGuards(PermissionsGuard)` and `@RequirePermission('...')` to provisioning, recording, presence, and other admin controllers. Define permission keys in seed data.  
**Owner:** Security / Backend  
**Effort:** Medium

### R-07: PostgreSQL migration load pipeline

**Issue:** H-05 / ML-01  
**Action:** Build post-freeze ETL script that reads Phase 19 migration batch JSON from Redis and writes to Prisma (with transaction safety). Not part of frozen toolkit.  
**Owner:** Migration Lead  
**Effort:** Large

### R-08: Kamailio usrloc persistence

**Issue:** H-06 / TL-05  
**Action:** Configure Kamailio usrloc with PostgreSQL backend (`db_mode=2`) for registration persistence across restarts.  
**Owner:** Telecom Ops  
**Effort:** Medium

---

## Medium — post go-live hardening (P2)

### R-09: Deploy observability stack

**Issue:** M-01, M-02 / OL-01, OL-02, OL-03  
**Action:** Deploy Prometheus (scrape `/api/v1/telecom/metrics`), Grafana dashboards, Loki log aggregation, Alertmanager rules per ADR-016.  
**Owner:** NOC / Platform Ops  
**Effort:** Medium

### R-10: Wire HA registries into health gates

**Issue:** M-04 / SC-01  
**Action:** Update `EnterpriseHealthService` and `CutoverReadinessService` to probe all nodes in `KAMAILIO_NODES` / `RTPENGINE_NODES` registries, not just default host.  
**Owner:** Platform Ops  
**Effort:** Small

### R-11: Strengthen `/api/ready` probe

**Issue:** M-03  
**Action:** Replace TCP socket checks with Redis PING + Prisma `SELECT 1` in `HealthController.readiness()`.  
**Owner:** Backend  
**Effort:** Small

### R-12: Activate RTPengine recording

**Issue:** M-06 / TL-04  
**Action:** Enable recording in rtpengine.conf; wire Kamailio to invoke recording lifecycle; connect to object storage.  
**Owner:** Telecom Ops  
**Effort:** Medium

### R-13: Fix restore validation weak check

**Issue:** M-07  
**Action:** Tighten `RestoreValidationService.runtimeCompatibility` to require exact phase match or minimum version semver.  
**Owner:** Backend  
**Effort:** Small

### R-14: Extract shared infrastructure module

**Issue:** M-08, AL-02  
**Action:** Move `PrismaService` and `TelecomRedisService` to `apps/api/src/platform/infrastructure/` to break telecom-as-platform-owner pattern.  
**Owner:** Architect  
**Effort:** Medium (refactor)

### R-15: Implement graceful shutdown flush

**Issue:** M-09  
**Action:** Invoke `GracefulShutdownService.flush()` from `ShutdownCoordinatorService` before process exit.  
**Owner:** Backend  
**Effort:** Small

### R-16: Implement READINESS_STRICT

**Issue:** M-10  
**Action:** Make `HaHealthService.isReadyForTraffic()` evaluate component health when `READINESS_STRICT=true`.  
**Owner:** Backend  
**Effort:** Small

---

## Low — technical debt (P3)

### R-17: Consolidate TCP health check utility

**Issue:** L-02  
**Action:** Extract shared `tcpProbe(host, port)` to `common/health/tcp-probe.ts`.  
**Effort:** Small

### R-18: Remove dead code

**Issue:** L-03  
**Action:** Use or remove `OBSERVABILITY_REDIS_KEYS`; remove unused `forwardRef` import in queue-core.module.  
**Effort:** Small

### R-19: Update Swagger metadata

**Issue:** L-01, DL-02  
**Action:** Update `main.ts` Swagger title/version to reflect Phase 20. Run `npm run telecom:openapi`.  
**Effort:** Small

### R-20: Complete Software Architecture Document

**Issue:** L-08, AL-03  
**Action:** Populate `docs/02-architecture/Software-Architecture-Document.md` from ADR catalog and phase docs.  
**Effort:** Medium

### R-21: Optimize metrics gauge refresh

**Issue:** L-09 / PERF-01  
**Action:** Replace per-call-answered Prisma count with incremental counter or periodic background refresh.  
**Effort:** Small

### R-22: Add firmware download authentication

**Issue:** L-07  
**Action:** Apply `ProvMacAuthGuard` or catalog token to firmware download endpoint.  
**Effort:** Small

### R-23: Implement identity domain modules

**Issue:** AL-01  
**Action:** Implement tenant/user/role/permission NestJS modules to match Prisma schema (future major release).  
**Effort:** Large

### R-24: SIP REFER transfer

**Issue:** L-10 / TL-03  
**Action:** Add REFER handling in Kamailio + transfer API (future feature phase).  
**Effort:** Large

---

## Operational recommendations (immediate)

These require no code changes:

1. **Use cutover readiness, not `/ready` alone** — `GET /api/v1/cutover/readiness` for go-live gates
2. **Export config snapshot before every deploy** — `GET /api/v1/production/config/export`
3. **Run smoke tests in staging with production env profile** before cutover window
4. **Scope initial go-live to core telephony** — registration, internal, PSTN; defer queue/IVR until R-04/R-05
5. **Begin 7-day hypercare** per checklist immediately after cutover
6. **Schedule post-go-live review** at day 7 to prioritize P1 backlog

---

## Priority matrix

| Priority | Count | Timeline |
|----------|-------|----------|
| P0 (Critical) | 3 | Before traffic cutover |
| P1 (High) | 5 | Before full feature rollout |
| P2 (Medium) | 8 | First 30 days post go-live |
| P3 (Low) | 8 | Backlog |

---

## Related documents

- [PRODUCTION_READINESS_REPORT.md](./PRODUCTION_READINESS_REPORT.md)
- [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)
- [docs/10-production/production-runbook.md](../10-production/production-runbook.md)
