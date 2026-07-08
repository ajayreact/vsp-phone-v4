# RC1 Operational Acceptance Checklist — VSP Phone v4

| Field | Value |
|-------|-------|
| **Version** | v4.0.0-rc1 |
| **Date** | 2026-07-08 |
| **Purpose** | Staging sign-off before production pilot |

**Instructions:** Complete all sections on the staging environment. Mark each item `[x]` when verified. Critical items block production cutover.

---

## Pre-flight validation

- [ ] `npm ci` completes without error
- [ ] `npm run telecom:validate:remediation` — **PASS**
- [ ] `npx nx build api` — **PASS**
- [ ] `npx nx build admin` — **PASS**
- [ ] Docker images build successfully on staging host
- [ ] `GET /api/health` returns `mode: remediation-complete`
- [ ] `GET /api/v1/cutover/readiness` reviewed (when stack is up)

---

## Infrastructure

### PostgreSQL
- [ ] Primary instance reachable from API
- [ ] Connection pool configured (`DATABASE_POOL_MAX`)
- [ ] Optional read replica probed (`DATABASE_READ_URL`) — HA health shows status
- [ ] Backup location writable (`BACKUP_LOCATION`)
- [ ] `POST /api/v1/ha/backup/execute` succeeds (or hook command tested)

### Redis
- [ ] Instance reachable; `GET /api/health/redis` up
- [ ] AOF or RDB persistence confirmed (`GET /api/v1/ha/backup/status`)
- [ ] Sentinel/cluster config documented if used

### Kamailio
- [ ] Container starts; entrypoint injects service auth token
- [ ] `KAMAILIO_REQUIRE_SERVICE_AUTH=true` in production
- [ ] `GET /api/health/kamailio` up
- [ ] Usrloc persistence mode verified (`GET /api/v1/ha/kamailio/persistence`)
- [ ] SIP TLS/WSS listeners active
- [ ] Dispatcher and permissions files present

### RTPengine
- [ ] UDP NG port reachable from Kamailio
- [ ] Media port range configured and firewall-open
- [ ] `GET /api/health/rtpengine` up

### TLS
- [ ] API TLS enabled (`TLS_ENABLED=true`)
- [ ] SIP TLS certificates valid
- [ ] WSS certificates valid for WebRTC
- [ ] Provisioning edge TLS valid
- [ ] Certificate expiry > 30 days

### DNS
- [ ] SIP domain (`SIP_PLATFORM_DOMAIN`) resolves correctly
- [ ] API public hostname resolves to load balancer
- [ ] Provisioning URL (`PROV_PUBLIC_BASE_URL`) resolves
- [ ] WebRTC WSS URL resolves

### Firewall
- [ ] SIP 5060/5061 (UDP/TCP/TLS) from allowed networks
- [ ] RTP media range open between endpoints and RTPengine
- [ ] API HTTPS from admin/client networks only
- [ ] Telnyx webhook ingress restricted

### Load Balancer
- [ ] Health check targets `/api/ready` (application-level)
- [ ] `READINESS_STRICT=true` for multi-node (if applicable)
- [ ] Sticky sessions not required (stateless API)
- [ ] Drain behavior tested on rolling deploy

---

## Telephony

### Registration
- [ ] SIP desk phone registers successfully
- [ ] WebRTC client registers via WSS
- [ ] Registration survives API restart (Redis mirror)
- [ ] Registration survives Kamailio restart (postgres usrloc mode)

### Calls
- [ ] Extension-to-extension call (audio both directions)
- [ ] Inbound PSTN call routes correctly
- [ ] Outbound PSTN call completes
- [ ] CallSession created in PostgreSQL
- [ ] Correlation IDs present in logs

### Transfers
- [ ] SIP REFER transfer — **N/A (deferred)** — document workaround if needed
- [ ] Call forwarding via routing rules — verify if configured

### Recording
- [ ] Recording policy evaluates on answered call
- [ ] Recording metadata created in API
- [ ] Media file capture — **verify limitation** (may not produce files)

### Queue
- [ ] Inbound call routes to queue APP_MEDIA target
- [ ] Queue wait / agent connect via routing/continue
- [ ] Overflow destination behaves as configured

### IVR
- [ ] IVR entry via APP_MEDIA
- [ ] DTMF / timeout progression via routing/continue

### Conference
- [ ] Conference bridge entry via APP_MEDIA
- [ ] Multi-party audio verified

### Presence
- [ ] Line presence updates on registration
- [ ] ON_CALL state on answered call
- [ ] Restore on call end
- [ ] Admin presence API (`GET /api/v1/presence/lines/:lineId`) with RBAC

### BLF
- [ ] BLF subscription endpoint responds
- [ ] Lamp state updates on presence change

### WebRTC
- [ ] JWT login succeeds
- [ ] WebRTC enroll returns credentials
- [ ] Browser softphone registers and calls
- [ ] STUN/TURN configured if required

### Grandstream
- [ ] Device enroll via admin API
- [ ] HTTPS provisioning URL reachable by phone
- [ ] Device registers after provision
- [ ] Reprovision and rollback tested

---

## Operations

### Monitoring
- [ ] Health endpoints monitored (api, postgres, redis, kamailio, rtpengine, telnyx)
- [ ] `GET /api/v1/observability/dashboard` accessible (service auth)
- [ ] `GET /api/v1/cutover/status` reviewed during test window

### Logs
- [ ] JSON structured logs emitted (`LOG_FORMAT=json`)
- [ ] Log redaction verified (no secrets in output)
- [ ] Kamailio xlog aggregated

### Alerts
- [ ] Alert rules defined for `/api/ready` failure
- [ ] Alert on cutover readiness `blocked: true`
- [ ] Alert on backup execution failure

### Metrics
- [ ] Telecom metrics endpoint available
- [ ] Postgres/Redis latency metrics recorded

### Audit
- [ ] Login/logout events in security audit
- [ ] Admin actions logged (provisioning, migration)
- [ ] Permission denied events monitored

### Backup
- [ ] Scheduled backup documented (`BACKUP_SCHEDULE`)
- [ ] `GET /api/v1/ha/backup/status` shows healthy state
- [ ] Off-site backup copy procedure documented

### Restore
- [ ] `POST /api/v1/production/restore/validate` passes
- [ ] `POST /api/v1/ha/backup/restore-readiness` passes
- [ ] Restore runbook reviewed (non-destructive)

---

## Migration

### Validation
- [ ] `POST /api/v1/migration/validate` for pilot tenant data
- [ ] Duplicate/orphan reports reviewed

### Dry Run
- [ ] `POST /api/v1/migration/dry-run` completes without errors

### Import
- [ ] Redis staging import executed
- [ ] Optional production import (tenant/queue) if required
- [ ] Super Admin JWT used for all import operations

### Verification
- [ ] Migration batch verification passed
- [ ] Mapping report archived

### Rollback
- [ ] Rollback metadata retained
- [ ] Rollback procedure understood (non-destructive)

---

## Security sign-off

- [ ] `TELECOM_SERVICE_AUTH_TOKEN` set on API and Kamailio
- [ ] `SECURITY_ENFORCE_TELECOM=true` confirmed
- [ ] `MIGRATION_DEV_SUPER_ADMIN=false`
- [ ] No dev secrets in production env
- [ ] RBAC permissions configured in database
- [ ] Telnyx webhook secret validated

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Platform Engineering | | | |
| Telecom Operations | | | |
| Security | | | |
| QA / Acceptance | | | |

---

## Related documents

- [RELEASE_NOTES_v4.0.0_RC1.md](./RELEASE_NOTES_v4.0.0_RC1.md)
- [FINAL_SIGNOFF.md](./FINAL_SIGNOFF.md)
- [docs/10-production/go-live-checklist.md](../10-production/go-live-checklist.md)
