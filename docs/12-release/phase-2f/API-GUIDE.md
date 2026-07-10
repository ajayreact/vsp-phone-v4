# VSP Phone v4 — API Guide (Production)

**Base URL:** `https://api.vspphone.com/api`  
**Auth:** `Authorization: Bearer <access_token>`

## Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/auth/login` | Email/password → access + refresh tokens |
| POST | `/v1/auth/refresh` | Refresh access token |
| POST | `/v1/auth/logout` | Revoke refresh token |

## Planes

### Platform (`/v1/platform/*`)

Requires platform permissions. Tenants, users, roles, billing, carriers, Telnyx, audit, settings, API keys.

### Operations (`/v1/ops/*`)

NOC dashboard, health, Kamailio, RTPEngine, registrations, dialogs, trace, media, alerts, fraud, synthetic.

### Supervisor (`/v1/supervisor/*`)

Dashboard, wallboard, agents, queues, live calls, actions (listen/whisper/barge), recordings, coaching, reports.

### Tenant (`/v1/tenant/*`)

Dashboard, users, extensions, devices, DIDs, routing, queues, IVR, voicemail, ring groups, CDR, recordings, marketplace.

### Carrier Admin

| Path | Permission (examples) |
|------|----------------------|
| GET `/v1/live-calls` | `ops:live_calls:read`, `supervisor:calls:read`, `tenant:admin` |
| GET `/v1/trunks` | ops/platform carrier read |
| GET `/v1/extensions` | platform carrier admin view |

## Response Shape

List endpoints return `{ data: T[] }`. Errors return JSON:

```json
{ "statusCode": 403, "message": "Forbidden resource" }
```

## Rate Limiting

Admin and sensitive routes use scoped rate limit guards. Retry with exponential backoff on 429.

## Audit

Mutations record actor (`createdBy`/`updatedBy`) and appear in `/v1/platform/audit` or tenant audit where enabled.

## OpenAPI

Swagger UI available at `/api/docs` when `SWAGGER_ENABLED=true` (disable in production public ingress).

## Health

| Path | Use |
|------|-----|
| GET `/v1/health` | Liveness |
| GET `/v1/ops/health` | Deep readiness |

See `docs/05-api/README.md` for ADR-level API standards.
