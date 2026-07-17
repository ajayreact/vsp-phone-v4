# Defect — APP-01

| Field | Value |
|-------|-------|
| ID | **APP-01** |
| Severity | **P0** |
| Status | **Open** |
| Target | AWS `GET /api/v1/tenant/extensions/hub` (+ `/hub/stats`) |

## Confirmed evidence

- Tenant portal `https://tenant.vspphone.com/extensions` (VSP INTERNAL) → **Unable to load data**.
- API logs: `SecurityExceptionFilter` → **HTTP 500** `INTERNAL_ERROR` on:
  - `GET /api/v1/tenant/extensions/hub`
  - `GET /api/v1/tenant/extensions/hub/stats`
- Filter previously logged status/path only (no underlying exception).
- `VSP_PLATFORM_INVENTORY_TENANT_ID=86403937-95ad-404c-8c2d-96313744edfc` is set (ENV-06 inventory wiring OK for env key).

## Likely cause

`listHub` always runs `syncOrphanDidsToExtensions` before listing. A data conflict / Prisma error in that sync becomes an uncaught **500** and blanks the entire Extensions page.

## Fix (code — RC1 critical)

1. Log underlying 500 exception server-side in `SecurityExceptionFilter`.
2. Catch sync failures in `listHub` so the hub still returns existing extensions.

Deploy: rebuild/recreate `api` from branch with this fix, then Retry Extensions UI.

## Immediate diagnosis (before/after deploy)

```bash
source scripts/platform/ec2-compose-env.sh
$COMPOSE logs --tail=200 api 2>&1 | grep -E 'errMsg|syncOrphan|Prisma|extensions/hub' | tail -40
```

After redeploy, Retry the page and capture the new `errMsg` / `stack` line if 500 persists.
