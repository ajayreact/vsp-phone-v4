# Production Runbook — VSP Phone v4

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Phase** | 20 — Production Cutover & Go-Live |
| **Audience** | Platform Ops, Telecom Ops, NOC |

---

## Purpose

This runbook describes the end-to-end production cutover procedure for migrating from the legacy VSP VoIP platform to VSP Phone v4.

---

## Prerequisites

- Phase 18 production readiness green (`GET /api/v1/production/readiness`)
- Phase 19 migration dry-run completed for pilot tenant
- Super Admin JWT with `platform:super_admin` permission
- Backup location configured and restore validation passed
- NOC and stakeholder notification completed

---

## Cutover sequence

### 1. Pre-cutover (T-24h to T-1h)

1. Run final readiness gate: `GET /api/v1/cutover/readiness`
2. Export config snapshot: `GET /api/v1/production/config/export`
3. Complete pre-cutover checklist (see Go-Live Checklist)
4. Confirm TLS certificates valid > 30 days
5. Verify Telnyx webhook and carrier routing

### 2. Migration window (T-0)

1. Set cutover state to `in_progress` (operational — via checklist tracking)
2. Execute migration import: `POST /api/v1/migration/import`
3. Verify batch: `GET /api/v1/migration/verification/{batchId}`
4. Review mapping report: `GET /api/v1/migration/report/{batchId}`

### 3. Smoke testing (T+15m)

1. Run automated smoke tests: `POST /api/v1/cutover/smoke-test`
2. Review results in cutover report: `GET /api/v1/cutover/report`
3. Execute manual call tests per Smoke Test Guide

### 4. Traffic cutover (T+30m)

1. Update carrier/DID routing to VSP Phone v4 (external — Telnyx console)
2. Monitor cutover status: `GET /api/v1/cutover/status`
3. Confirm registrations and call paths

### 5. Post-go-live (T+1h)

1. Complete post-cutover checklist
2. Begin hypercare monitoring (7 days)
3. Export final cutover report for sign-off

---

## API reference

| Action | Method | Endpoint |
|--------|--------|----------|
| Cutover status | GET | `/api/v1/cutover/status` |
| Readiness gate | GET | `/api/v1/cutover/readiness` |
| Smoke tests | POST | `/api/v1/cutover/smoke-test` |
| Cutover report | GET | `/api/v1/cutover/report` |
| Rollback plan | GET | `/api/v1/cutover/rollback-plan` |

All endpoints require Super Admin JWT authorization.

---

## Escalation

| Severity | Contact | Action |
|----------|---------|--------|
| P1 — Service down | NOC + Incident Commander | Initiate rollback runbook |
| P2 — Degraded calls | Telecom Ops | Investigate Kamailio/RTPengine/Telnyx |
| P3 — Non-critical | Platform Ops | Continue monitoring |

---

## Related documents

- [Go-Live Checklist](./go-live-checklist.md)
- [Smoke Test Guide](./smoke-test-guide.md)
- [Rollback Runbook](./rollback-runbook.md)
- [NOC Operations Guide](./noc-operations-guide.md)
