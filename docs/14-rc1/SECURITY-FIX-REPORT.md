# RC1 Blocker Resolution — Security Fix Report

| Field | Value |
|-------|-------|
| **Blocker** | RC1-001 |
| **Release commit** | Branch tip of `release/v4.0.0-rc1` (supersedes `ee3f990`) |
| **Status** | **Fixed in release candidate** — staging deploy + integration verify required |
| **Date** | 2026-07-13 |

## Problem

Admin BFF routes under `/api/bff/observability/*` and `/api/bff/readiness` were publicly accessible. Middleware treats `/api` as public. Routes proxied to the API using `TELECOM_SERVICE_AUTH_TOKEN` and accepted untrusted `?tenantId=` query parameters.

## Fix

### New module: `apps/admin/src/lib/bff/bff-auth.ts`

- Extracts `Authorization: Bearer` JWT from request
- Validates session via `GET /v1/auth/me` (same as browser auth)
- Enforces permission sets:
  - **Health / dashboard / readiness:** `platform:super_admin`, `ops:health:read`, `ops:infra:read`, `ops:dashboard:read`
  - **Live calls:** `platform:super_admin`, `ops:live_calls:read`, `ops:dashboard:read`
- **Tenant scope:** `resolveBffTenantId()` uses JWT `tenantId` only — query `tenantId` ignored
- Returns **401** unauthenticated, **403** insufficient permissions

### Routes updated

| Route | Auth | Tenant scope |
|-------|------|--------------|
| `/api/bff/observability/health` | Required | N/A (global health) |
| `/api/bff/observability/dashboard` | Required | JWT `tenantId` |
| `/api/bff/observability/calls` | Required | JWT `tenantId` |
| `/api/bff/readiness` | Required | N/A |

### Client update

`bffGet()` in `http-client.ts` now forwards `Authorization: Bearer` from session storage.

## Tests

| Test | Result |
|------|--------|
| `node scripts/platform/test-bff-auth-unit.cjs` | **8/8 PASS** |
| `node scripts/platform/verify-bff-security.cjs` | Requires deploy + credentials |

### Expected integration results (post-deploy)

| Request | Expected |
|---------|----------|
| Anonymous | **401** |
| Tenant JWT (no ops permissions) | **403** |
| Platform admin / ops user | **200** or **503** (if service token missing on server) |

## Staging note

Pre-deploy probe to `https://admin.vspphone.com/api/bff/observability/health` returned **502** (legacy deployment). Re-run `verify-bff-security.cjs` after deploying this build.

## Files changed

- `apps/admin/src/lib/bff/bff-auth.ts` (new)
- `apps/admin/src/lib/bff/bff-auth.spec.ts` (new, Jest — run via unit script)
- `apps/admin/src/app/api/bff/observability/*.ts` (3 routes)
- `apps/admin/src/app/api/bff/readiness/route.ts`
- `apps/admin/src/lib/api/http-client.ts`
- `scripts/platform/test-bff-auth-unit.cjs` (new)
- `scripts/platform/verify-bff-security.cjs` (new)
