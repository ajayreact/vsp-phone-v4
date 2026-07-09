# 05 — Go-Live Acceptance Test Report (Template)

| Field | Value |
|-------|-------|
| **Environment** | EC2 / Staging / Production |
| **Host** | `ip-172-31-39-116` (example) |
| **Branch** | `release/v4.0.0-rc1` |
| **Commit** | `b7475cf` or later |
| **Tester** | |
| **Date** | |

---

## Executive summary

| Metric | Value |
|--------|-------|
| Total tests | |
| Passed | |
| Failed | |
| Blocked | |
| Critical open | |

**Recommendation:** ☐ Go | ☐ Go with conditions | ☐ No-go

---

## Test record format

Use this table for each executed test. Copy rows as needed.

| ID | Category | Purpose | Steps | Expected | Actual | Status | Remarks |
|----|----------|---------|-------|----------|--------|--------|---------|
| T-001 | API | Liveness | `curl -sk $API/health` | `status: ok` | | ☐ Pass ☐ Fail | |
| T-002 | API | Readiness | `curl -sk $API/ready` | all deps up | | | |
| T-003 | Postgres | version table | psql kamailio version | location=9 | | | |
| T-004 | Redis | ping | redis-cli ping | PONG | | | |
| T-005 | Kamailio | config lint | kamailio -c | config ok | | | |
| T-006 | Kamailio | HTTP health | curl :8880/health | ok | | | |
| T-007 | RTPengine | health probe | /health/rtpengine | up | | | |
| T-008 | Telnyx | carrier | /health/telnyx | GREEN | | | |
| T-009 | Docker | ps | compose ps | all healthy | | | |
| T-010 | TLS | API cert | openssl s_client :3000 | valid | | | |
| T-011 | Auth | login | POST /v1/auth/login | 200 | | | |
| T-012 | Cutover | readiness | GET cutover/readiness | ready:true | | | |
| T-013 | Cutover | smoke | POST smoke-test | all pass | | | |
| T-014 | SIP | REGISTER | phone register | 200 OK | | | |
| T-015 | SIP | internal call | ext→ext | connected | | | |
| T-016 | PSTN | inbound | call DID | ring+answer | | | |
| T-017 | PSTN | outbound | dial E.164 | connected | | | |
| T-018 | WebRTC | WSS register | browser softphone | registered | | | |
| T-019 | Grandstream | prov XML | GET cfg.xml | valid | | | |
| T-020 | Recording | metadata | recording/intent | accepted | | | TL-02 media |

---

## EC2 baseline (2026-07-09) — pre-filled reference

Tests already executed during RC1 deployment:

| ID | Test | Expected | Actual | Status |
|----|------|----------|--------|--------|
| T-002 | `/api/ready` | kamailio+rtpengine up | `haReady: true`, latency ~43ms | ✅ Pass |
| T-003 | version table | location=9 | 3 rows correct | ✅ Pass |
| T-005 | kamailio -c | config ok | 1 warning (constant if) | ✅ Pass |
| T-006 | compose ps | healthy | api+kamailio+postgres+redis+rtpengine | ✅ Pass |
| T-001 | `/api/health` | ok | remediation-complete | ✅ Pass |

**Pending for production traffic:** T-014–T-019 live call scenarios, Telnyx prod credentials, production TLS certs, external DNS.

---

## Defect log

| Defect ID | Severity | Summary | Root cause | Fix | Retest |
|-----------|----------|---------|------------|-----|--------|
| | Critical/High/Med/Low | | | | ☐ |

---

## Conditions for go-live

1. Complete manual SIP scenarios 1–7 with real endpoints.
2. Replace dev TLS with production PKI.
3. Set `TELNYX_WEBHOOK_SECRET` production value.
4. Deploy `rtpengine-daemon` before accepting media SLA.
5. Configure real `QUEUE_MEDIA_URI` / `IVR_MEDIA_URI` (not placeholders).

---

## Approvals

| Role | Decision | Date |
|------|----------|------|
| QA / Telecom | | |
| Engineering | | |
| Operations | | |
