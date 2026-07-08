# Hypercare Checklist — First 7 Days

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Phase** | 20 |
| **Duration** | 7 days post go-live |

---

## Overview

Hypercare provides enhanced monitoring and support during the first week after production cutover.

---

## Daily checks (Days 1–7)

| # | Check | Owner | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 | Day 6 | Day 7 |
|---|-------|-------|-------|-------|-------|-------|-------|-------|-------|
| 1 | `/api/v1/cutover/status` — no active alarms | NOC | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 2 | `/api/v1/production/readiness` green | Platform Ops | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 3 | Kamailio/RTPengine health | Telecom Ops | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 4 | Telnyx carrier health | Telecom Ops | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 5 | Registration count stable | Telecom Ops | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 6 | No customer P1 tickets | Support | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 7 | Observability dashboards reviewed | NOC | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## Day 1 — Intensive monitoring

- Poll `/api/v1/cutover/status` every 15 minutes
- On-call engineer available 24/7
- Smoke test re-run at T+4h and T+8h
- Review all audit logs for migration/cutover events

---

## Day 2–3 — Elevated monitoring

- Poll cutover status every 30 minutes
- Review call quality metrics
- Confirm provisioning for any remaining devices
- Address any migration warnings from Phase 19 report

---

## Day 4–7 — Standard monitoring

- Poll cutover status every 60 minutes
- Transition to standard NOC procedures
- Document lessons learned
- Schedule hypercare exit review

---

## Hypercare exit criteria

Hypercare ends when all of the following are met:

1. 7 consecutive days with no P1/P2 incidents
2. All daily checks passed for final 3 days
3. Customer support ticket volume at baseline
4. Stakeholder approval for hypercare exit

---

## Exit sign-off

| Role | Name | Date |
|------|------|------|
| NOC Lead | | |
| Platform Ops Lead | | |
| Project Manager | | |

---

## Related documents

- [NOC Operations Guide](./noc-operations-guide.md)
- [Post-Go-Live Verification Guide](./post-go-live-verification-guide.md)
