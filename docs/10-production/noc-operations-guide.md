# NOC Operations Guide — VSP Phone v4

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Phase** | 20 |

---

## Overview

Network Operations Center (NOC) monitoring guide for VSP Phone v4 production operations and cutover events.

---

## Health endpoints

| Endpoint | Purpose | Expected |
|----------|---------|----------|
| `GET /api/health` | Liveness | `status: ok`, mode `phase20-production-cutover` |
| `GET /api/ready` | Readiness | `status: ok` |
| `GET /api/v1/telecom/health` | Telecom health | `status: ok` |
| `GET /api/v1/ha/readiness` | HA readiness | All components green |
| `GET /api/v1/production/readiness` | Production readiness | `ready: true` |
| `GET /api/v1/cutover/status` | Cutover monitoring | See below |

---

## Cutover monitoring

During cutover windows, poll `GET /api/v1/cutover/status` every 60 seconds.

### Key fields

| Field | Green | Red |
|-------|-------|-----|
| `readiness.ready` | `true` | `false` |
| `readiness.blocked` | `false` | `true` |
| `smokeTests.passed` | `true` | `false` |
| `activeAlarms` | `[]` | Non-empty array |
| `cutoverState` | `completed` | `in_progress` with failures |

### Component health summary

The `healthSummary` field reports status for: `api`, `postgres`, `redis`, `kamailio`, `rtpengine`, `telnyx`.

---

## Alarms and escalation

| Alarm | Severity | Action |
|-------|----------|--------|
| `phase18_readiness: failed` | P1 | Block cutover; investigate deployment |
| `kamailio: failed` | P1 | Check Kamailio service, TCP port 8880 |
| `rtpengine: failed` | P1 | Check RTPengine NG port 2223 |
| `telnyx: failed` | P1 | Check carrier credentials and connectivity |
| `smoke_tests: failed` | P2 | Review smoke test report; escalate to Telecom Ops |
| `postgresql: failed` | P1 | Check DATABASE_URL, PostgreSQL service |
| `redis: failed` | P1 | Check REDIS_URL, Redis service |

---

## Observability

| Resource | Location |
|----------|----------|
| Structured logs | API stdout (JSON format when `LOG_FORMAT=json`) |
| Metrics | `GET /api/v1/telecom/metrics` (Prometheus-compatible) |
| Audit trail | `SecurityAuditService` — migration and cutover events |
| Config export | `GET /api/v1/production/config/export` |

---

## Cutover window procedures

1. **T-1h:** Confirm all health endpoints green
2. **T-0:** Begin polling `/api/v1/cutover/status`
3. **T+15m:** Verify smoke test results
4. **T+30m:** Confirm call path tests passing
5. **T+1h:** Transition to hypercare monitoring

---

## Hypercare (first 7 days)

See [Hypercare Checklist](./hypercare-checklist.md).

---

## Related documents

- [Production Runbook](./production-runbook.md)
- [Post-Go-Live Verification Guide](./post-go-live-verification-guide.md)
