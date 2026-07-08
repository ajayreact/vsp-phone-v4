# Known Limitations — VSP Phone v4

| Field | Value |
|-------|-------|
| **Document ID** | AUDIT-007 |
| **Date** | 2026-07-09 |
| **Version** | 4.0.0-rc1 |
| **Status** | Post-remediation / RC1 baseline |

---

## Purpose

This document records **accepted limitations** at RC1. Items marked **Resolved (remediation)** are no longer open blockers but are listed for operator awareness. Remaining items require post-RC1 change control or external operational mitigations.

For remediation status see [FINDINGS_MATRIX.md](./FINDINGS_MATRIX.md).

---

## Telecom limitations

### TL-01: SIP REFER transfer not implemented — **Open**

**Impact:** Blind and attended call transfer not available.

**Workaround:** Manual call forwarding via feature codes that resolve to FORK (if configured).

### TL-02: Recording media capture deferred — **Accepted**

**Impact:** Recording policy evaluates and metadata is created, but RTPengine recording is not active. Recording files may not be produced.

**Workaround:** External recording solution or post-RC1 RTPengine recording activation.

### TL-03: RTPengine single-node in Kamailio — **Accepted**

**Impact:** Kamailio uses static `udp:rtpengine:2223`. Multi-node RTPengine registry in API is not connected to the media path.

**Workaround:** Scale vertically on RTPengine node; expand port range.

### TL-04: Placeholder media URIs — **Operational**

**Impact:** `QUEUE_MEDIA_URI`, `IVR_MEDIA_URI`, etc. may point to `sip:*@media.vsp.internal` placeholders without a real media application server.

**Workaround:** Configure real media URIs in environment. APP_MEDIA Kamailio handling is **resolved** — media URIs must be reachable SIP targets.

### TL-05: Device telecom endpoint partial — **Accepted**

**Impact:** `POST /v1/telecom/device` returns `placeholder: true` in response contract.

**Workaround:** Use provisioning and registration APIs for device lifecycle.

### ~~TL-06: APP_MEDIA not handled in Kamailio~~ — **Resolved (remediation H-01)**

Kamailio `route[APP_MEDIA_RELAY]` handles queue, IVR, conference, park, and voicemail targets.

### ~~TL-07: routing/continue not wired~~ — **Resolved (remediation H-02)**

In-dialog INFO triggers `route[ROUTING_CONTINUE]` → `/api/v1/telecom/routing/continue`.

### ~~TL-08: Kamailio usrloc memory-only~~ — **Resolved (remediation H-06, configurable)**

Set `KAMAILIO_USRLOC_PERSISTENCE=postgres` for restart-safe registrations.

---

## Security limitations

### SL-01: Dev-open guards when secrets unset — **Operational**

**Impact:** When `TELECOM_SERVICE_AUTH_TOKEN` or `TELNYX_WEBHOOK_SECRET` unset, guards allow requests with warning logs (lab mode).

**Workaround:** Always set secrets in production. `ProductionConfigValidatorService` fail-fast enforces this.

### SL-02: Firmware download network exposure — **Accepted (L-07)**

**Impact:** Grandstream firmware download endpoint may be reachable without application auth.

**Workaround:** Restrict via network ACL, TLS edge, or provisioning VLAN.

### ~~SL-03: Kamailio service auth header missing~~ — **Resolved (remediation C-01)**

`route[NESTJS_HTTP_HDRS]` + entrypoint token injection.

### ~~SL-04: RBAC not enforced~~ — **Resolved (remediation H-03)**

`PermissionsGuard` on provisioning, recording, presence admin APIs.

### ~~SL-05: Telecom tenant enforcement opt-in~~ — **Resolved (remediation H-04)**

`SECURITY_ENFORCE_TELECOM` defaults `true` when `VSP_ENV=production`.

---

## Migration limitations

### ML-01: Production import scope — **Accepted**

**Impact:** Optional production import writes **tenant** and **queue** entities only. Other entities remain Redis-staged.

**Workaround:** External PostgreSQL import using migration reports for remaining entities.

### ML-02: Non-destructive rollback — **By design**

**Impact:** Rollback generates metadata and checklists only. No automatic data deletion.

**Workaround:** [rollback-runbook.md](../10-production/rollback-runbook.md).

### ML-03: Verified batch required in production — **By design**

**Impact:** Cutover readiness requires at least one verified migration batch when `VSP_ENV=production`.

---

## Production / DR limitations

### ~~PL-01: No automated backup execution~~ — **Resolved (remediation C-02)**

`BackupOrchestrationService` + `POST /api/v1/ha/backup/execute`. External scheduler still recommended.

### PL-02: Restore validation is non-destructive — **By design**

**Impact:** Restore validation checks markers and connectivity — does not restore data.

**Workaround:** Manual restore drill in staging before production cutover.

### PL-03: Smoke tests are config/health probes — **By design**

**Impact:** Phase 20 smoke tests validate configuration and health — not live call placement.

**Workaround:** Manual call tests per [smoke-test-guide.md](../10-production/smoke-test-guide.md).

---

## Observability limitations

### OL-01: No distributed tracing deployment — **Deferred**

**Impact:** Redis-based call tracing only. No OpenTelemetry/Jaeger in repo.

**Workaround:** Structured logs + correlation IDs. See [TROUBLESHOOTING.md](../10-production/TROUBLESHOOTING.md).

### OL-02: No centralized log aggregation deployment — **Deferred**

**Impact:** JSON logs to stdout only.

**Workaround:** Container log driver or sidecar in deployment platform.

### OL-03: No Grafana/Alertmanager deployment — **Deferred**

**Impact:** Metrics at `/api/v1/telecom/metrics`; no bundled dashboards.

### OL-04: In-process metrics — **Accepted**

**Impact:** Metrics are per-API-instance.

---

## Architecture limitations

### AL-01: Stub domain modules — **Accepted (M-08)**

**Impact:** Prisma schema complete; some NestJS domain modules are placeholders. No CRUD admin API for full identity management.

**Workaround:** Direct database administration or future phase.

### AL-02: TelecomModule as infrastructure owner — **Accepted**

**Impact:** Prisma/Redis under telecom path, used globally.

### AL-03: Software Architecture Document incomplete — **Deferred**

**Workaround:** ADR catalog and phase completion docs are authoritative.

---

## Scalability limitations

### SC-01: Single Kamailio instance default — **Operational**

**Impact:** Default deployment assumes one Kamailio node unless clustered externally.

**Workaround:** `KAMAILIO_USRLOC_PERSISTENCE=postgres` + `KAMAILIO_NODES` for HA readiness reporting.

### SC-02: RTPengine port range — **Operational**

**Impact:** Default 100 media ports (10000–10099) limits concurrent sessions per node.

---

## RC1 accepted baseline

Limitations marked **Open**, **Accepted**, **Deferred**, or **By design** above are the RC1 baseline. **Resolved** items are retained for traceability only.

---

## Related documents

- [FINDINGS_MATRIX.md](./FINDINGS_MATRIX.md)
- [REMEDIATION_REPORT.md](./REMEDIATION_REPORT.md)
- [TROUBLESHOOTING.md](../10-production/TROUBLESHOOTING.md)
