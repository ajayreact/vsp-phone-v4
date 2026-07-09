# 03 — API Validation Matrix

| Field | Value |
|-------|-------|
| **Base URL** | `https://<host>:3000/api` |
| **Prefix** | `/api` |
| **Auth types** | None (health), Bearer JWT (admin), `X-VSP-Service-Auth` (telecom plane) |

```bash
export API="https://127.0.0.1:3000/api"
export TOKEN="$TELECOM_SERVICE_AUTH_TOKEN"
export AUTH="X-VSP-Service-Auth: $TOKEN"
export JWT="Bearer <from /v1/auth/login>"
```

---

## Health (no auth)

| Method | Path | Expected HTTP | Expected body |
|--------|------|---------------|---------------|
| GET | `/health` | 200 | `status: ok`, `mode: remediation-complete` |
| GET | `/health/api` | 200 | `status: up` |
| GET | `/health/postgres` | 200 | `status: up` |
| GET | `/health/redis` | 200 | `status: up` |
| GET | `/health/kamailio` | 200 | `status: up` |
| GET | `/health/rtpengine` | 200 | `status: up` |
| GET | `/health/telnyx` | 200 | carrier status |
| GET | `/ready` | 200 | all deps up, `haReady: true` |

```bash
for p in health health/postgres health/redis health/kamailio health/rtpengine health/telnyx ready; do
  echo "=== $p ==="
  curl -sk -w "\nHTTP %{http_code}\n" "$API/$p"
done
```

---

## Auth (`/v1/auth`)

| Method | Path | Auth | Expected |
|--------|------|------|----------|
| POST | `/v1/auth/login` | None | 200 + tokens (valid creds) |
| POST | `/v1/auth/login` | None | 401 (invalid creds) |
| POST | `/v1/auth/refresh` | Body refresh token | 200 |
| POST | `/v1/auth/refresh-token/issue` | JWT | 200 |
| POST | `/v1/auth/logout` | JWT | 200 |

```bash
curl -sk -X POST "$API/v1/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"***"}' | jq .
```

---

## Telecom — Kamailio contracts (`/v1/telecom`)

**Auth:** `X-VSP-Service-Auth: $TELECOM_SERVICE_AUTH_TOKEN` (required production)

| Method | Path | Purpose | Expected |
|--------|------|---------|----------|
| GET | `/v1/telecom/health` | Plane health | 200 |
| POST | `/v1/telecom/authenticate` | Legacy auth alias | 200 |
| POST | `/v1/telecom/auth/sip-digest` | REGISTER digest | 200 allow/deny |
| POST | `/v1/telecom/route` | Legacy route alias | 200 |
| POST | `/v1/telecom/register` | Registration notify | 202/200 |
| POST | `/v1/telecom/unregister` | Unregister notify | 200 |
| POST | `/v1/telecom/routing/resolve` | INVITE routing | 200 + action |
| POST | `/v1/telecom/routing/continue` | Mid-call (INFO) | 200 + action |
| POST | `/v1/telecom/call/start` | Call session start | 200 |
| POST | `/v1/telecom/call/update` | Call update | 200 |
| POST | `/v1/telecom/call/end` | Call end | 200 |
| POST | `/v1/telecom/media/lifecycle` | RTPengine events | 200 |
| POST | `/v1/telecom/recording/lifecycle` | Recording events | 200 |
| POST | `/v1/telecom/recording/intent` | Recording policy | 200 |
| POST | `/v1/telecom/presence` | Presence update | 200 |
| POST | `/v1/telecom/blf/subscribe` | BLF subscribe | 200 |
| POST | `/v1/telecom/presence/subscribe` | Presence sub | 200 |
| POST | `/v1/telecom/device` | Device stub | 200 + `placeholder: true` |
| GET | `/v1/telecom/metrics` | Metrics | 200 |

```bash
curl -sk -H "$AUTH" -H 'Content-Type: application/json' \
  -X POST "$API/v1/telecom/routing/resolve" -d @test/fixtures/routing-resolve.json
```

**Negative tests:**

```bash
# Missing service auth (production must reject)
curl -sk -X POST "$API/v1/telecom/routing/resolve" -H 'Content-Type: application/json' -d '{}'
# Expected: 401/403 when SECURITY_ENFORCE_TELECOM=true
```

---

## Carrier / Telnyx

| Method | Path | Auth | Expected |
|--------|------|------|----------|
| GET | `/v1/telecom/carrier/health` | Service or JWT | 200 |
| POST | `/v1/telecom/carrier/failover` | Admin JWT | 200 |
| POST | `/v1/webhooks/telnyx` | HMAC signature | 200/401 |
| POST | `/v1/webhooks/carriers/telnyx` | HMAC | 200/401 |

---

## WebRTC

| Method | Path | Auth | Expected |
|--------|------|------|----------|
| POST | `/v1/telecom/webrtc/enroll` | JWT + RBAC | 200 credentials |
| POST | `/v1/telecom/webrtc/enroll/revoke` | JWT | 200 |
| POST | `/v1/telecom/webrtc/presence` | JWT | 200 |

---

## Provisioning (admin)

| Method | Path | Auth | Expected |
|--------|------|------|----------|
| POST | `/v1/provisioning/devices/enroll` | JWT + PermissionsGuard | 201 |
| POST | `/v1/provisioning/devices/:id/assign` | JWT | 200 |
| POST | `/v1/provisioning/devices/reprovision` | JWT | 200 |
| POST | `/v1/provisioning/devices/rollback` | JWT | 200 |
| POST | `/v1/provisioning/render` | Internal | 200 |

**Prov edge (port 3444, no /api prefix):**

| GET | `/gs/:mac/cfg.xml` | MAC basic auth | XML config |
| GET | `/fw/:model/:version/:file` | Network ACL | firmware |
| GET | `/health` | None | ok |

---

## Recording admin

| GET | `/v1/recordings` | JWT + permission | 200 list |
| GET | `/v1/recordings/:id/url` | JWT | 200 signed URL or 404 |

---

## Presence admin

| GET | `/v1/presence/lines/:lineId` | JWT | 200 |
| PATCH | `/v1/presence/lines/:lineId` | JWT | 200 |
| GET | `/v1/presence/subscriptions` | JWT | 200 |

---

## HA / backup

| Method | Path | Auth | Expected |
|--------|------|------|----------|
| GET | `/v1/ha/readiness` | Service/JWT | 200 |
| GET | `/v1/ha/health` | JWT | 200 cluster |
| GET | `/v1/ha/backup/status` | JWT | 200 |
| POST | `/v1/ha/backup/execute` | JWT | 200 |
| GET | `/v1/ha/kamailio/persistence` | Service | postgres mode |
| POST | `/v1/ha/backup/config-snapshot` | JWT | 200 |

---

## Cutover / production

| Method | Path | Auth | Expected |
|--------|------|------|----------|
| GET | `/v1/cutover/status` | JWT | 200 |
| GET | `/v1/cutover/readiness` | JWT | `ready: true` |
| POST | `/v1/cutover/smoke-test` | JWT | all pass |
| GET | `/v1/cutover/report` | JWT | CSV/JSON |
| GET | `/v1/production/readiness` | Service | 200 |
| GET | `/v1/production/config/export` | Service | redacted config |

---

## Migration

| GET | `/v1/migration/validate` | JWT | 200 |
| POST | `/v1/migration/dry-run` | JWT | 200 |
| POST | `/v1/migration/import` | JWT | 202 |

---

## Observability

| GET | `/v1/observability/dashboard` | JWT | 200 |
| GET | `/v1/observability/health/detail` | JWT | 200 |
| GET | `/v1/telecom/metrics` | Service | Prometheus-style |

---

## Validation dimensions checklist

| Dimension | How to verify |
|-----------|---------------|
| **HTTP status** | `curl -w '%{http_code}'` |
| **JSON schema** | `jq` required fields |
| **Authorization** | Call without token → 401 |
| **Tenant isolation** | Cross-tenant ID → 403/404 |
| **Input validation** | Malformed body → 400 |
| **RBAC** | User without permission → 403 |

---

## Production platform (`/v1/production`)

| Method | Path | Auth | Expected |
|--------|------|------|----------|
| GET | `/v1/production/readiness` | Service/JWT | 200 |
| GET | `/v1/production/version` | JWT | 200 |
| GET | `/v1/production/environment` | JWT | 200 |
| GET | `/v1/production/config/export` | Service | redacted config |
| POST | `/v1/production/restore/validate` | JWT | 200 |
| GET | `/v1/production/backup/readiness` | JWT | 200 |
| GET | `/v1/production/cicd/readiness` | JWT | 200 |

---

## Migration (`/v1/migration`)

| GET | `/v1/migration/validate` | JWT | 200 |
| POST | `/v1/migration/dry-run` | JWT | 200 |
| POST | `/v1/migration/import` | JWT | 202 |
| GET | `/v1/migration/report/:batchId` | JWT | 200 |
| GET | `/v1/migration/verification/:batchId` | JWT | 200 |
| GET | `/v1/migration/rollback/:batchId` | JWT | 200 |

---

## Observability (`/v1/observability`)

| GET | `/v1/observability/dashboard` | JWT | 200 |
| GET | `/v1/observability/diagnostics/calls` | JWT | 200 |
| GET | `/v1/observability/audit` | JWT | 200 |
| GET | `/v1/observability/health/detail` | JWT | 200 |

---

## Internal provisioning

| POST | `/v1/internal/provisioning/render` | Internal/service | 200 |

---

## Cutover (extended)

| GET | `/v1/cutover/rollback-plan` | JWT | 200 plan JSON |

---

## HA (extended)

| GET | `/v1/ha/shutdown` | JWT | 200 status |
| POST | `/v1/ha/backup/restore-readiness` | JWT | 200 |
| POST | `/v1/ha/backup/restore-verify` | JWT | 200 |

---

## RBAC & tenant isolation tests

```bash
# 1. Login as tenant A admin
JWT_A=$(curl -sk -X POST "$API/v1/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"tenant-a@example.com","password":"***"}' | jq -r '.accessToken')

# 2. Access tenant B resource → expect 403 or 404
curl -sk -H "Authorization: Bearer $JWT_A" "$API/v1/recordings/TENANT_B_RECORDING_ID" -w "\nHTTP %{http_code}\n"

# 3. Missing permission → 403
curl -sk -H "Authorization: Bearer $JWT_A" -X POST "$API/v1/provisioning/devices/enroll" \
  -H 'Content-Type: application/json' -d '{}' -w "\nHTTP %{http_code}\n"

# 4. Invalid body → 400
curl -sk -H "Authorization: Bearer $JWT_A" -X POST "$API/v1/auth/login" \
  -H 'Content-Type: application/json' -d '{"email":"not-an-email"}' -w "\nHTTP %{http_code}\n"
```

---

## Full endpoint sweep script

```bash
#!/bin/bash
API="https://127.0.0.1:3000/api"
paths=(
  health ready health/postgres health/redis health/kamailio health/rtpengine health/telnyx
)
for p in "${paths[@]}"; do
  code=$(curl -sk -o /tmp/body -w '%{http_code}' "$API/$p")
  echo "$p → HTTP $code $(head -c 80 /tmp/body)"
done
```

---

## OpenAPI / Swagger

```bash
curl -sk "$API/docs-json" | jq '.paths | keys[]' | head -40
# Browser: https://HOST:3000/api/docs (if SWAGGER_ENABLED)
```

Reference: [docs/05-api/README.md](../05-api/README.md), ADR-024.
