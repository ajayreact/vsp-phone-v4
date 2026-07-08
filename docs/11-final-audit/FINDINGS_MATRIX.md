# Findings Matrix — Engineering Remediation Sprint

| Field | Value |
|-------|-------|
| **Document ID** | REMED-002 |
| **Date** | 2026-07-08 |
| **Classification** | Resolved · Accepted Risk · Deferred |

---

## Critical

| ID | Finding | Classification | Justification / Evidence |
|----|---------|----------------|--------------------------|
| **C-01** | Kamailio does not send `X-VSP-Service-Auth` | **Resolved** | `route[NESTJS_HTTP_HDRS]` on all HTTP calls; entrypoint token injection; production validation |
| **C-02** | Backup is config-only, no orchestration | **Resolved** | `BackupOrchestrationService` + HA/production APIs; hook-based pg_dump |

---

## High

| ID | Finding | Classification | Justification / Evidence |
|----|---------|----------------|--------------------------|
| **H-01** | Kamailio missing APP_MEDIA handling | **Resolved** | `route[APP_MEDIA_RELAY]` in `kamailio.cfg` |
| **H-02** | Kamailio missing `/routing/continue` | **Resolved** | `route[ROUTING_CONTINUE]` via in-dialog INFO |
| **H-03** | RBAC not applied to controllers | **Resolved** | `PermissionsGuard` on provisioning, recording, presence |
| **H-04** | `SECURITY_ENFORCE_TELECOM` defaults false | **Resolved** | Production default `true` in `env.validation.ts` |
| **H-05** | Migration import Redis-only | **Resolved** | `MigrationDatabaseImportService` for tenant/queue; extensible pattern |
| **H-06** | usrloc memory-only | **Resolved** | Configurable postgres persistence via entrypoint |

---

## Medium

| ID | Finding | Classification | Justification / Evidence |
|----|---------|----------------|--------------------------|
| **M-01** | No OpenTelemetry/Jaeger | **Deferred** | ADR-016 partial; requires infrastructure deployment outside freeze |
| **M-02** | No Loki/Grafana/Alertmanager | **Deferred** | Observability stack deployment — post-cutover ops project |
| **M-03** | `/api/ready` TCP-only | **Resolved** | Application probes via `EnterpriseHealthService.checkAll()` |
| **M-04** | HA registries not in health gates | **Resolved** | `READINESS_STRICT` cluster checks in `HaHealthService` |
| **M-05** | Read replica unused for queries | **Deferred** | Replica probed in HA snapshot; query routing requires schema/service audit |
| **M-06** | Recording media not in RTPengine | **Accepted Risk** | API policy complete; media capture documented in KNOWN_LIMITATIONS |
| **M-07** | Weak restore runtime check | **Resolved** | Known phase whitelist in `RestoreValidationService` |
| **M-08** | Empty domain module stubs | **Accepted Risk** | Engineering freeze; Prisma schema complete; modules deferred by design |
| **M-09** | Shutdown flush not invoked | **Resolved** | `ShutdownCoordinatorService.onApplicationShutdown` calls `flush()` |
| **M-10** | `READINESS_STRICT` no-op | **Resolved** | Implemented in `isReadyForTraffic()` |

---

## Low

| ID | Finding | Classification | Justification / Evidence |
|----|---------|----------------|--------------------------|
| **L-01** | Stale Swagger metadata | **Resolved** | Version `1.0.0-remediation` |
| **L-02** | Duplicate TCP health logic | **Resolved** | `common/health/tcp-probe.ts` |
| **L-03** | Unused `OBSERVABILITY_REDIS_KEYS` | **Deferred** | Retained as key layout reference; inline keys used in services |
| **L-04** | Audit "stream" naming | **Deferred** | Non-blocking naming; Redis list semantics documented |
| **L-05** | `liveliness()` typo | **Deferred** | Public route stable; rename is breaking for monitors |
| **L-06** | Inconsistent phase strings | **Resolved** | Unified to `remediation-complete` for health surfaces |
| **L-07** | Unauthenticated firmware download | **Accepted Risk** | Mitigate via network ACL / prov edge TLS; documented in checklist |
| **L-08** | Software Architecture Document draft | **Deferred** | Separate documentation sprint |
| **L-09** | Prisma gauge on every call-answered | **Deferred** | Performance optimization — non-blocking |
| **L-10** | SIP REFER not implemented | **Deferred** | Pre-audit deferral; out of remediation scope |

---

## Summary

| Classification | Count |
|----------------|-------|
| Resolved | 18 |
| Accepted Risk | 3 |
| Deferred | 9 |

**Critical open:** 0  
**High blocking production scope:** 0
