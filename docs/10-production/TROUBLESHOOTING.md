# Troubleshooting Guide — VSP Phone v4

| Version | 4.0.0-rc1 |
|---------|-----------|
| **Audience** | NOC, platform operators, Super Admin |

Operational troubleshooting for RC1 staging and production environments.

---

## General diagnostics

### Health endpoints

| Endpoint | Healthy | Unhealthy indicates |
|----------|---------|---------------------|
| `GET /api/health` | `status: ok` | API process down |
| `GET /api/ready` | `status: ok` | Dependency or HA gate failure |
| `GET /api/v1/cutover/readiness` | `ready: true` | Cutover blocked — see `criticalFailures` |
| `GET /api/v1/ha/health` | Cluster snapshot | Extended HA detail |

### Log locations

- **API:** JSON structured logs to stdout (`LOG_FORMAT=json`)
- **Kamailio:** Container stdout / `xlog` levels
- **RTPengine:** Container logs (`RTPENGINE_LOG_LEVEL`)

Search logs by `platformUuid`, `correlationId`, or `callid`.

### Correlation

Every call should have:

- SIP `Call-ID`
- NestJS `platformUuid` (HTTP header / response)
- Redis correlation keys `vsp:{tenantId}:corr:...`

Use `GET /api/v1/observability/diagnostics/calls?platformUuid=...` (service auth).

---

## Registration issues

### Symptom: Phone will not register

**Checks:**

1. Kamailio listening: `GET /api/health/kamailio`
2. Digest auth: Kamailio logs for `401` / `403` on REGISTER
3. `POST /api/v1/telecom/auth/sip-digest` — verify `TELECOM_SERVICE_AUTH_TOKEN` on Kamailio
4. Credential vault: `SIP_VAULT_JSON` or `SIP_DEV_PASSWORD` (lab only)
5. TLS: Phone trusts SIP TLS cert if using `5061`

**Common causes:**

| Cause | Fix |
|-------|-----|
| Missing `X-VSP-Service-Auth` | Set `TELECOM_SERVICE_AUTH_TOKEN` on Kamailio; `KAMAILIO_REQUIRE_SERVICE_AUTH=true` |
| Wrong password | Update vault / re-provision device |
| Expired registration | Phone should re-register; check `SIP_DEFAULT_EXPIRES_SEC` |
| Kamailio restart (memory usrloc) | Set `KAMAILIO_USRLOC_PERSISTENCE=postgres` |

### Symptom: Registration lost after Kamailio restart

**Cause:** Memory usrloc mode.

**Fix:** Enable postgres persistence:

```env
KAMAILIO_USRLOC_PERSISTENCE=postgres
KAMAILIO_USRLOC_DB_URL=postgresql://...
```

Apply `infrastructure/kamailio/usrloc-schema.sql` before cutover.

Verify: `GET /api/v1/ha/kamailio/persistence` → `restartSafe: true`

---

## RTPengine failures

### Symptom: One-way audio or no audio

**Checks:**

1. `GET /api/health/rtpengine` — TCP to NG port (default 2223)
2. Kamailio logs for `rtpengine_offer` / `rtpengine_answer` errors
3. Firewall: UDP media range open (`RTPENGINE_PORT_MIN`–`RTPENGINE_PORT_MAX`)
4. NAT: `RTPENGINE_ADVERTISE` set if endpoints are behind NAT

**Common causes:**

| Cause | Fix |
|-------|-----|
| RTPengine unreachable | Start container; verify `RTPENGINE_HOST` from Kamailio |
| Port range exhausted | Expand range in `rtpengine.conf` and firewall |
| No rtpengine in INVITE path | Check routing returns media anchor plan |

### Symptom: RTPengine container unhealthy

Check `infrastructure/docker/rtpengine/healthcheck.sh` output. Verify UDP NG port from Kamailio container:

```bash
nc -z -u rtpengine 2223
```

---

## Kamailio connectivity

### Symptom: All calls fail / HTTP errors in Kamailio logs

**Checks:**

1. API reachable from Kamailio: `KAMAILIO_HTTP_HOST:KAMAILIO_HTTP_PORT`
2. Service auth: `401` on NestJS → token mismatch
3. `kamailio -c` passes after entrypoint (config lint)

**Common causes:**

| Cause | Fix |
|-------|-----|
| `TELECOM_SERVICE_AUTH_TOKEN` mismatch | Sync token on API and Kamailio |
| API not ready | Check `GET /api/ready` |
| TLS mismatch | API HTTPS vs Kamailio HTTP client URL |

### Symptom: APP_MEDIA / queue / IVR calls fail at SIP layer

**Checks:**

1. Routing API returns `"type": "APP_MEDIA"` with valid target URI
2. Kamailio logs for `APP_MEDIA relay` in `route[APP_MEDIA_RELAY]`
3. Media URI reachable (`QUEUE_MEDIA_URI`, etc.)

See [enterprise-sip-call-flows-runtime-architecture.md](../04-telecom/enterprise-sip-call-flows-runtime-architecture.md).

### Symptom: Mid-call queue/IVR does not progress

**Checks:**

1. In-dialog INFO reaches `route[ROUTING_CONTINUE]`
2. `POST /api/v1/telecom/routing/continue` returns valid plan
3. Service auth header present on continue request

---

## Redis outages

### Symptom: API degraded / rate limits fail open

**Checks:**

1. `GET /api/health/redis` — application ping
2. Redis persistence: `GET /api/v1/ha/backup/status` → `redisPersistence.ok`
3. Connection: `REDIS_URL`, Sentinel/cluster config if used

**Impact:**

- Rate limiting may fail
- Presence cache unavailable
- HA markers not persisted
- Session/correlation data lost (calls in progress may degrade)

**Recovery:**

1. Restore Redis from AOF/RDB backup
2. Restart API after Redis healthy
3. Verify `GET /api/ready`

---

## PostgreSQL outages

### Symptom: API not ready / 503 on `/api/ready`

**Checks:**

1. `GET /api/health/postgres` — `SELECT 1`
2. `DATABASE_URL` connectivity from API container
3. Connection pool exhaustion: `DATABASE_POOL_MAX`

**Impact:**

- Registration/auth against Prisma fails
- Routing falls back or rejects depending on path
- Admin APIs unavailable

**Recovery:**

1. Restore PostgreSQL from backup (`BACKUP_LOCATION` / external backup)
2. Verify schema: `npx prisma migrate status`
3. API auto-reconnect via `PostgresHaService`

---

## Telnyx issues

### Symptom: Inbound/outbound PSTN fails

**Checks:**

1. `GET /api/health/telnyx` — carrier health adapter
2. `TELNYX_WEBHOOK_SECRET` for inbound webhook validation
3. Dispatcher list: `infrastructure/kamailio/dispatcher.list` includes Telnyx
4. Trunk/DID tenant mapping in database

**Common causes:**

| Cause | Fix |
|-------|-----|
| Webhook signature failure | Set `TELNYX_WEBHOOK_SECRET`; check Telnyx portal |
| Wrong SIP host | Verify `TELNYX_SIP_HOST` |
| DID not mapped to tenant | Check Prisma DID records |

---

## TLS failures

### Symptom: HTTPS API or WSS WebRTC fails

**Checks:**

1. `npm run tls:validate`
2. Cert expiry on `TLS_API_CERT_FILE`, `TLS_WSS_CERT_FILE`, `TLS_SIP_CERT_FILE`
3. Client trust store includes issuing CA

**Common causes:**

| Cause | Fix |
|-------|-----|
| Expired certificate | Rotate per [tls README](../../scripts/tls/README.md) |
| Wrong file paths in env | Verify paths inside container mount |
| `TLS_ENABLED=false` in production | Set `TLS_ENABLED=true`; cutover readiness blocks |

---

## Provisioning failures

### Symptom: Grandstream phone will not provision

**Checks:**

1. `PROV_PUBLIC_BASE_URL` reachable from phone network
2. `PROV_HTTPS_ENABLED=true` with valid prov TLS cert
3. Device enrolled: `POST /api/v1/provisioning/devices/enroll`
4. MAC in quarantine logs if unknown device

**Common causes:**

| Cause | Fix |
|-------|-----|
| Firewall blocks prov port | Open `PROV_HTTPS_PORT` (default 3444) |
| Wrong tenant/line assignment | Re-assign via admin API |
| Artifact missing | Check `PROV_ARTIFACT_ROOT` writable |

---

## Backup failures

### Symptom: `POST /api/v1/ha/backup/execute` fails

**Checks:**

1. `BACKUP_LOCATION` writable
2. `DATABASE_URL` valid for pg_dump
3. Optional `BACKUP_POSTGRES_HOOK_CMD` exit code
4. Redis persistence: AOF or RDB in `GET /api/v1/ha/backup/status`

**Fix:**

- Create backup directory with correct permissions
- Test hook command manually
- Enable Redis AOF (default in docker-compose)

---

## Migration failures

### Symptom: Cutover readiness blocked on migration

**Checks:**

1. At least one verified batch when `VSP_ENV=production`
2. `GET /api/v1/migration/batches` — status `verified`
3. Dry-run completed without errors

**Common causes:**

| Cause | Fix |
|-------|-----|
| No verified batch | Complete import + verification for pilot tenant |
| Duplicate entities | Review mapping report; fix source data |
| Production import rejected | Use `productionImportConfirm=I_CONFIRM_PRODUCTION_IMPORT` |

---

## Health check failures

### Symptom: Load balancer marks API unhealthy

**Checks:**

1. `GET /api/ready` response body — which check failed
2. `READINESS_STRICT=true` — Kamailio/RTPengine cluster nodes must have one `up`
3. Shutdown drain: `draining: true` during deploy

**Fix per failed check:**

| Check | Action |
|-------|--------|
| postgres | Fix DB connectivity |
| redis | Fix Redis |
| kamailio / rtpengine | Start telecom containers |
| haReady | Review cluster node registry |

---

## Rollback references

Rollback is **non-destructive**. Do not expect automatic data revert.

| Scenario | Document |
|----------|----------|
| Cutover rollback | [rollback-runbook.md](./rollback-runbook.md) |
| Migration rollback metadata | Phase 19 migration batch `rollback` field |
| DNS/SIP revert | [go-live-checklist.md](./go-live-checklist.md) |
| Hypercare | [hypercare-checklist.md](./hypercare-checklist.md) |

Emergency: `GET /api/v1/cutover/rollback-plan` (Super Admin JWT).

---

## Escalation

1. Collect: timestamp, tenantId, platformUuid, Call-ID, relevant log excerpts (redacted)
2. Check: `GET /api/v1/cutover/status` and `GET /api/v1/observability/dashboard`
3. Reference: [noc-operations-guide.md](./noc-operations-guide.md)

---

## Related documents

- [production-runbook.md](./production-runbook.md)
- [smoke-test-guide.md](./smoke-test-guide.md)
- [KNOWN_LIMITATIONS.md](../11-final-audit/KNOWN_LIMITATIONS.md)
- [API docs](../05-api/README.md)
