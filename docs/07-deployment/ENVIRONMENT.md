# Environment Configuration — VSP Phone v4

| Version | 4.0.0-rc1 |
|---------|-----------|

Canonical reference for every environment variable consumed by the NestJS API and admin BFF.

---

## Quick reference

| File | Purpose |
|------|---------|
| [`.env.production.template`](../../.env.production.template) | **Required** production variables only |
| [`.env.optional.template`](../../.env.optional.template) | Optional API variables with defaults |
| [`.env.example`](../../.env.example) | Local development quick start |

```bash
# Production server
cp .env.production.template .env
# Add optional tuning from .env.optional.template as needed
```

---

## JWT configuration

VSP Phone v4 does **not** use `@nestjs/jwt`, Passport, or `JwtStrategy`. Authentication uses a custom HMAC-SHA256 implementation.

| Item | Value |
|------|-------|
| Sign | `apps/api/src/modules/auth/jwt.util.ts` → `signJwt()` |
| Verify | `apps/api/src/modules/auth/jwt-auth.guard.ts` → `verifyJwt()` |
| Secret | `JWT_SECRET` (production required); fallback `DEV_JWT_SECRET` (lab only) |
| Algorithm | `HS256` |
| Issuer / audience | **Not used** |
| TTL | `JWT_ACCESS_TTL_SEC` (default 3600) |
| Payload fields | `sub`, `tenantId`, `email`, `iat`, `exp` |
| Roles / permissions | **Not in JWT** — loaded from PostgreSQL via `PermissionsGuard` |

---

## Production-required variables

Validated by `apps/api/src/app/env.validation.ts` → `assertProductionSecurity()` and startup checks.

| Variable | Consumed by | Notes |
|----------|-------------|-------|
| `VSP_ENV` | Env validation, security policy | Must be `production` |
| `JWT_SECRET` | `AuthService`, `JwtAuthGuard` | Required when `VSP_ENV=production` |
| `TELECOM_SERVICE_AUTH_TOKEN` | `TelecomServiceAuthGuard`, admin BFF | Required when `VSP_ENV=production` |
| `TELNYX_WEBHOOK_SECRET` | `TelnyxCarrierAdapter` | Required when `VSP_ENV=production` |
| `TLS_ENABLED` | `loadHttpsOptions`, security validators | Must be `true` in production |
| `DATABASE_URL` | Prisma | Required at startup |
| `REDIS_URL` | Redis clients | Required at startup |

### Strongly recommended (carrier-admin + admin UI)

| Variable | Consumed by | Notes |
|----------|-------------|-------|
| `TELNYX_API_KEY` | `TelnyxApiClient` | Telnyx REST sync/purchase; optional in schema but required for live inventory |
| `VSP_PLATFORM_INVENTORY_TENANT_ID` | `TelnyxNumbersService` | Platform tenant UUID for unassigned numbers |
| `NEXT_PUBLIC_API_URL` | Admin browser bundle | **Build-time** ARG in `Dockerfile.admin` |
| `API_INTERNAL_URL` | Admin BFF routes | Server-side proxy to API (default `http://api:3000/api` in Compose) |
| `CORS_ORIGINS` | `main.ts` | Browser admin origin allowlist |
| `BACKUP_LOCATION` | HA backup services | Required by production config validator |
| `SECURITY_ENFORCE_TELECOM` | Telecom authorization | Defaults `true` when `VSP_ENV=production` |

---

## Telnyx variables (actually consumed)

| Variable | Read by API? | Purpose |
|----------|--------------|---------|
| `TELNYX_API_KEY` | ✓ | REST client Bearer token |
| `TELNYX_API_BASE_URL` | ✓ | API base (default `https://api.telnyx.com/v2`) |
| `TELNYX_SIP_HOST` | ✓ | Carrier SIP host in config JSON |
| `TELNYX_DISPATCHER_SET` | ✓ | Kamailio dispatcher set |
| `TELNYX_WEBHOOK_SECRET` | ✓ | Inbound webhook HMAC |
| `VSP_PLATFORM_INVENTORY_TENANT_ID` | ✓ | Platform inventory tenant |

### Not used by this codebase (removed from templates)

These are **not** environment variables in VSP Phone v4. Connection/profile IDs are optional **request body** fields on purchase/update APIs:

- `TELNYX_CONNECTION_ID`
- `TELNYX_CALL_CONTROL_APP_ID`
- `TELNYX_CREDENTIAL_CONNECTION_ID`
- `TELNYX_MESSAGING_PROFILE_ID`
- `TELNYX_OUTBOUND_VOICE_PROFILE_ID`
- `API_PUBLIC_URL`, `ADMIN_ORIGIN`, `WEB_ORIGIN` (use `NEXT_PUBLIC_API_URL` and `CORS_ORIGINS`)

---

## Docker Compose environment delivery

### API container (`vsp-api`)

| Source | Variables |
|--------|-----------|
| `env_file: [.env]` | All keys from host `.env` |
| `docker-compose.yml` `environment` | Overrides `DATABASE_URL`, `REDIS_URL`, `POSTGRES_HOST`, `REDIS_HOST`, TLS paths, `TELECOM_SERVICE_AUTH_TOKEN` |
| `docker-compose.host-db.yml` | Overrides `DATABASE_URL` for host PostgreSQL |
| `docker-compose.prod.yml` | Explicit passthrough: `JWT_SECRET`, `TELECOM_SERVICE_AUTH_TOKEN`, `TELNYX_WEBHOOK_SECRET`, `TELNYX_API_KEY`, `VSP_PLATFORM_INVENTORY_TENANT_ID`, `CORS_ORIGINS` |

**Verify inside container (no secret values printed):**

```bash
docker exec vsp-api node -e "
const keys=['JWT_SECRET','TELNYX_API_KEY','DATABASE_URL','REDIS_URL','VSP_PLATFORM_INVENTORY_TENANT_ID'];
for (const k of keys) {
  const v=process.env[k];
  console.log(k+':', v ? 'SET len='+v.length : 'MISSING');
}"
```

### Admin container (`vsp-admin`)

| Source | Variables |
|--------|-----------|
| `env_file: [.env]` | Runtime server vars |
| Build ARG `NEXT_PUBLIC_API_URL` | Baked into browser bundle at **image build** |
| `docker-compose.prod.yml` | `TELECOM_SERVICE_AUTH_TOKEN`, `API_INTERNAL_URL` |

**Rebuild admin after changing `NEXT_PUBLIC_API_URL`:**

```bash
export ADMIN_DOCKER_TARGET=production
export NEXT_PUBLIC_API_URL=https://api.vspphone.com/api
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache admin
```

---

## Auth flow

```
POST /api/v1/auth/login
  → AuthService.login() → signJwt({ sub, tenantId, email })
  → Response: { accessToken, tokenType, expiresInSec, ... }

Browser / curl
  → Authorization: Bearer <accessToken>

GET /api/v1/carriers/telnyx/numbers
  → JwtAuthGuard (verify signature + exp)     → 401 if invalid
  → PermissionsGuard (DB lookup)              → 403 if missing permission
  → AdminRateLimitGuard
  → TelnyxNumbersController
```

Permissions such as `platform:super_admin` are **not** in the JWT. They are resolved from `RolePermission` via `PermissionsService.userHasPermission(userId, key)`.

---

## Complete API variable catalog

All keys validated in `apps/api/src/app/env.validation.ts` (`ApiEnv` type). See [`.env.optional.template`](../../.env.optional.template) for defaults.

### Admin-only (not in ApiEnv)

| Variable | Consumed by |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Admin browser (`client.ts`, `api-client.ts`) |
| `API_INTERNAL_URL` | Admin BFF server routes |
| `TELECOM_SERVICE_AUTH_TOKEN` | Admin BFF → observability proxy |

---

## Variables referenced in code but missing from env validation

| Variable | Where used | Documented here |
|----------|------------|-----------------|
| `TLS_PROV_CERT_FILE` | `tls.options.ts` → `loadProvHttpsOptions()` | ✓ optional template |
| `TLS_PROV_KEY_FILE` | `tls.options.ts` | ✓ optional template |
| `GIT_COMMIT` | `release-info.service.ts` | Aliased via `BUILD_GIT_COMMIT` in validation |
| `RECORDING_STORAGE_PATH` | `smoke-test.service.ts` only | Legacy smoke-test key; use `S3_*` + Redis instead |

---

## Variables removed (obsolete / unused)

| Variable | Reason |
|----------|--------|
| `DEV_TELECOM_HMAC_SECRET` | Never read by API; removed from `.env.example` |
| `NEXT_PUBLIC_WSS_URL` | Not consumed by admin or API code |
| Duplicate `NEXT_PUBLIC_API_URL` | Was listed twice in old `.env.example` |
| `TELNYX_CONNECTION_ID` etc. | Never implemented as env vars |

---

## Production configuration audit report

| Section | Result |
|---------|--------|
| **JWT Configuration** | **PASS** — custom HS256; same secret for sign/verify; no Passport |
| **Environment** | **PASS** (after template cleanup) — templates split required/optional |
| **Authentication** | **OPERATOR** — requires valid login email + `JWT_SECRET` in container |
| **Permissions** | **PASS** — DB-backed; not JWT-embedded |
| **Telnyx Configuration** | **PASS** — 6 env vars documented; obsolete IDs removed |
| **Docker Environment** | **PASS** — `env_file` + prod overlay passthrough documented |

### Root cause of recent 401 errors

Login was attempted with placeholder email `YOUR_ADMIN_EMAIL`, producing a null `accessToken`. Carrier-admin routes correctly return **401 Invalid or expired token** at `JwtAuthGuard` before permissions are checked.

### Recommended operator actions

1. Use real admin credentials: `POST /api/v1/auth/login`
2. Verify token: `GET /api/v1/auth/me` → confirm `platform:super_admin` in permissions
3. Confirm container env: `docker exec vsp-api` length check (above)
4. Rebuild admin if `NEXT_PUBLIC_API_URL` changed

---

## Related documents

- [Deployment README](./README.md)
- [FINAL_DEPLOYMENT_CHECKLIST.md](../11-final-audit/FINAL_DEPLOYMENT_CHECKLIST.md)
- [ENVIRONMENT_UPDATE_REPORT.md](../12-release/ENVIRONMENT_UPDATE_REPORT.md)
