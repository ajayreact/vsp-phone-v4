# Go-Live Checklist — VSP Phone v4

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Phase** | 20 |

---

## Pre-cutover

| ID | Item | Owner | Status | Notes |
|----|------|-------|--------|-------|
| PC-01 | Phase 18 production readiness green | Platform Ops | ☐ | `GET /api/v1/production/readiness` |
| PC-02 | Phase 19 migration dry-run passed | Migration Lead | ☐ | `POST /api/v1/migration/dry-run` |
| PC-03 | Config snapshot exported | Platform Ops | ☐ | `GET /api/v1/production/config/export` |
| PC-04 | Backup location verified | Platform Ops | ☐ | `GET /api/v1/production/backup/readiness` |
| PC-05 | TLS certificates valid | Security | ☐ | Cert expiry > 30 days |
| PC-06 | Telnyx webhook configured | Telecom Ops | ☐ | `TELNYX_WEBHOOK_SECRET` set |
| PC-07 | Stakeholders notified | Project Manager | ☐ | Cutover window communicated |
| PC-08 | NOC dashboards ready | NOC | ☐ | Observability endpoints green |
| PC-09 | Final cutover readiness gate | Platform Ops | ☐ | `GET /api/v1/cutover/readiness` |

---

## Migration

| ID | Item | Owner | Status | Notes |
|----|------|-------|--------|-------|
| MG-01 | Migration import executed | Migration Lead | ☐ | `POST /api/v1/migration/import` |
| MG-02 | Batch verification passed | Migration Lead | ☐ | `GET /api/v1/migration/verification/{batchId}` |
| MG-03 | DID assignments validated | Telecom Ops | ☐ | Cross-check carrier inventory |
| MG-04 | SIP account mappings confirmed | Telecom Ops | ☐ | |
| MG-05 | Provisioning profiles staged | Provisioning Ops | ☐ | |
| MG-06 | Smoke tests executed | QA / NOC | ☐ | `POST /api/v1/cutover/smoke-test` |

---

## Post-cutover

| ID | Item | Owner | Status | Notes |
|----|------|-------|--------|-------|
| PO-01 | Inbound call verified | Telecom Ops | ☐ | Live test call |
| PO-02 | Outbound call verified | Telecom Ops | ☐ | Live test call |
| PO-03 | WebRTC registration verified | Telecom Ops | ☐ | Browser client test |
| PO-04 | Desk phone registration verified | Provisioning Ops | ☐ | Grandstream test |
| PO-05 | IVR and queue verified | PBX Ops | ☐ | |
| PO-06 | Recording and presence verified | PBX Ops | ☐ | |
| PO-07 | Cutover report exported | Project Manager | ☐ | `GET /api/v1/cutover/report?format=csv` |
| PO-08 | Go-live sign-off | Project Manager | ☐ | |
| PO-09 | Hypercare started | NOC | ☐ | See Hypercare Checklist |

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Project Manager | | | |
| Platform Ops Lead | | | |
| Telecom Ops Lead | | | |
| NOC Lead | | | |
