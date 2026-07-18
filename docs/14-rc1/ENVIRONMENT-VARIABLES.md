# RC1 Environment Variables

Reference: `.env.production.template`, `.env.example`, `docs/07-deployment/ENVIRONMENT.md`

## Critical (production required)

| Variable | Purpose | RC1 note |
|----------|---------|----------|
| `VSP_ENV` | Environment label | Must be `production` |
| `JWT_SECRET` | Access token signing | Min 32 chars; no `DEV_JWT_SECRET` fallback |
| `DATABASE_URL` | PostgreSQL | Connection pool via `DATABASE_POOL_MAX` |
| `REDIS_URL` | Sessions, lockout, HA | Required for auth hardening |
| `TELECOM_SERVICE_AUTH_TOKEN` | Service-to-service auth | Required; unset = open stub guard |
| `SECURITY_ENFORCE_TELECOM` | Tenant scoping on telecom writes | Must be `true` |
| `NEXT_PUBLIC_API_URL` | Admin browser API base | Public HTTPS URL |
| `API_INTERNAL_URL` | Admin BFF → API | Internal network URL |

## Must NOT be set in production

| Variable | Risk |
|----------|------|
| `DEV_AUTH_EMAIL` / `DEV_AUTH_PASSWORD` / `DEV_AUTH_USER_ID` / `DEV_AUTH_TENANT_ID` | Backdoor login |
| `DEV_JWT_SECRET` | Weak token signing |
| `SWAGGER_ENABLED=true` | API surface exposure |

## Telnyx / carrier

| Variable | Purpose |
|----------|---------|
| `TELNYX_API_KEY` | Number inventory sync, purchase |
| `TELNYX_WEBHOOK_SECRET` | Webhook signature verification |
| `VSP_PLATFORM_INVENTORY_TENANT_ID` | **Deprecated** — unused (Global Inventory = `ownerTenantId` NULL) |
| `ALLOW_MULTIPLE_DIDS_PER_EXTENSION` | Default `false`. When false, assign dropdown and API enforce One DID ↔ One Extension |

## Admin portals

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_PORTAL` | Dev only — portal override on localhost |

## Telecom / SIP

| Variable | Purpose |
|----------|---------|
| `SIP_PLATFORM_DOMAIN` | SIP realm |
| `KAMAILIO_REQUIRE_SERVICE_AUTH` | Must be `true` in production |
| `WEBRTC_WSS_URL` | Browser softphone WSS |
| `PROV_PUBLIC_BASE_URL` | Desk phone provisioning HTTPS |

## Health / readiness

| Variable | Purpose |
|----------|---------|
| `READINESS_STRICT` | Strict ready probe for load balancers |
| `TLS_ENABLED` | API TLS |

## Verification

```bash
# After deploy
curl -s https://<api>/api/health
curl -s https://<api>/api/ready
curl -s https://<api>/api/v1/cutover/readiness   # when stack up
```
