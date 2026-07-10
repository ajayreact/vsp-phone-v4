# Phase 2F — Platform Audit Report

**Date:** 2026-07-10  
**Scope:** admin.vspphone.com · app.vspphone.com · tenant.vspphone.com  
**Branch:** release/v4.0.0-rc1

## Architecture

VSP Phone v4 ships one Next.js admin app (`apps/admin`) deployed three times with hostname / `NEXT_PUBLIC_PORTAL`:

| Hostname | Portal | Modules |
|----------|--------|---------|
| admin.* | platform | 12 routes — tenants, billing, Telnyx, RBAC, API keys |
| app.* | ops | 13 routes — NOC, supervisor, live calls, infra |
| tenant.* | tenant | 21 routes — PBX, marketplace (DIDs), supervisor |

**Routes verified:** 35 page routes under `apps/admin/src/app/(portal)/`.  
**Nav modules:** 46 total across `platform-nav.ts`, `ops-nav.ts`, `tenant-nav.ts`.

## Portal Route Audit

See FINAL-REPORT for fixes applied. All three portals audited route-by-route; live API integrations confirmed for production modules.

## Placeholder Removal

| Finding | Action |
|---------|--------|
| Dead CreateButton (no onClick) on 8 tenant modules | Wired to POST APIs or removed |
| ExtensionsContent wrong API `/v1/extensions` | Switched to `/v1/tenant/extensions` |
| Disabled Add Trunk button | Removed (trunks are carrier-managed) |
| ModulePage dead Refresh placeholder | Removed scaffold |
| SIP Trace cosmetic Search button | Wired to query + empty state |

## API Validation

All frontend HTTP paths map to NestJS controllers with JWT + PermissionsGuard. Fixed: `GET /v1/live-calls` accepts `ops:live_calls:read` and `supervisor:calls:read`.

## Portal Middleware

`apps/admin/src/middleware.ts` redirects cross-portal URL access to `/dashboard`.
