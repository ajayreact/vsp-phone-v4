# API Documentation — VSP Phone v4

| Version | 4.0.0-rc1 |
|---------|-----------|

Central reference for the VSP Phone v4 HTTP API surface.

---

## Overview

VSP Phone v4 exposes a **contract-first NestJS API** consumed by:

- **Kamailio** — SIP plane (service auth header)
- **Admin / WebRTC clients** — JWT bearer auth
- **Super Admin operators** — migration and cutover tooling

Global prefix: `/api` (configurable via `API_GLOBAL_PREFIX`).

### Primary API groups

| Tag | Base path | Auth | Purpose |
|-----|-----------|------|---------|
| telecom | `/api/v1/telecom/*` | Service auth | SIP routing, auth, media lifecycle |
| auth | `/api/v1/auth/*` | Public / JWT | Login, refresh, logout |
| provisioning | `/api/v1/provisioning/*` | JWT + RBAC | Grandstream enrollment |
| recordings | `/api/v1/recordings/*` | JWT + RBAC | Recording metadata |
| presence | `/api/v1/presence/*` | JWT + RBAC | Line presence |
| production | `/api/v1/production/*` | Service auth | Readiness, config export |
| cutover | `/api/v1/cutover/*` | Super Admin JWT | Go-live orchestration |
| migration | `/api/v1/migration/*` | Super Admin JWT | Data migration |
| ha | `/api/v1/ha/*` | Service auth | Backup, cluster health |
| observability | `/api/v1/observability/*` | Service auth | Dashboard, audit, diagnostics |

### Health endpoints (no auth)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Liveness |
| `GET /api/ready` | Readiness (app-level probes) |
| `GET /api/health/postgres` | PostgreSQL probe |
| `GET /api/health/redis` | Redis probe |
| `GET /api/health/kamailio` | Kamailio TCP probe |
| `GET /api/health/rtpengine` | RTPengine TCP probe |

---

## Authentication

### User plane (JWT)

1. `POST /api/v1/auth/login` — returns access + refresh tokens
2. Include header: `Authorization: Bearer <access_token>`
3. Refresh via `POST /api/v1/auth/refresh`

JWT payload includes `sub` (user id), `tenantId`, and session metadata. All tenant-scoped admin APIs filter by `tenantId` from the token.

**Production:** Set `JWT_SECRET`. Do not use `DEV_JWT_SECRET` or `DEV_AUTH_*` in production.

### Service plane (Kamailio → API)

Include on every Kamailio-origin request:

```
X-VSP-Service-Auth: <TELECOM_SERVICE_AUTH_TOKEN>
```

When token is unset (development only), `TelecomServiceAuthGuard` allows requests with a warning log.

**Production:** `TELECOM_SERVICE_AUTH_TOKEN` required. Kamailio entrypoint injects the same token.

### Super Admin (migration / cutover)

Requires JWT for a user with `platform:super_admin` permission (Prisma `RolePermission`).

Development bypass: `MIGRATION_DEV_SUPER_ADMIN=true` — **must be `false` in production**.

---

## RBAC permissions

| Permission key | Used by |
|----------------|---------|
| `platform:super_admin` | Migration, cutover |
| `tenant:admin` | Tenant administration |
| `tenant:user` | Standard user |
| `provisioning:admin` | Device enrollment |
| `recordings:read` | Recording playback |
| `presence:read` / `presence:write` | Presence APIs |

Enforced via `@RequirePermission()` on admin controllers.

---

## OpenAPI / Swagger

- **Runtime Swagger:** `GET /api/docs` when `SWAGGER_ENABLED=true`
- **Static export:** `docs/09-implementation/openapi-telecom-phase5.json`
- **Regenerate:** `npm run telecom:openapi`
- **Version:** `1.0.0-remediation` (Swagger metadata)

### Key telecom contracts (Kamailio)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/telecom/auth/sip-digest` | SIP digest authentication |
| POST | `/api/v1/telecom/register` | Registration lifecycle |
| POST | `/api/v1/telecom/routing/resolve` | Inbound routing decision |
| POST | `/api/v1/telecom/routing/continue` | Mid-call application progression |
| POST | `/api/v1/telecom/call/start` | CallSession start |
| POST | `/api/v1/telecom/media/lifecycle` | RTPengine correlation |

See [ADR-024 Kamailio NestJS contracts](../ADR/ADR-024-kamailio-nestjs-api-contracts.md).

---

## Rate limiting

All sensitive endpoints are rate-limited per client IP via Redis sliding window:

- Auth: `RATE_LIMIT_AUTH_MAX`
- Telecom: `RATE_LIMIT_TELECOM_MAX`
- WebRTC: `RATE_LIMIT_WEBRTC_MAX`
- Admin: `RATE_LIMIT_ADMIN_MAX`

---

## Error responses

- Standard NestJS HTTP exceptions
- Telecom paths may include additional detail in `/v1/telecom/*` error responses
- Secrets redacted in logs via `LogRedactionService`

---

## Related documents

- [Security overview](../06-security/README.md)
- [Deployment guide](../07-deployment/README.md)
- [Testing strategy](../08-testing/README.md)
- [Troubleshooting](../10-production/TROUBLESHOOTING.md)
- [Telecom architecture](../04-telecom/kamailio-telecom-integration-architecture.md)
