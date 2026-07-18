# RC1 Known Issues

| Field | Value |
|-------|-------|
| **Version** | v4.0.0-rc1 |
| **Updated** | 2026-07-13 |

## Release blockers

| ID | Severity | Issue | Workaround |
|----|----------|-------|------------|
| RC1-001 | **Critical** | Admin BFF routes (`/api/bff/observability/*`) skip middleware auth | **Fixed in code, verified on staging** — 11/11 checks pass |
| RC1-002 | **High** | Live E2E workflows not verified — no platform credentials in CI/local `.env` | Set `PLATFORM_EMAIL`/`PLATFORM_PASSWORD`; run verification scripts |
| RC1-003 | **Resolved** | Browser QA (Chrome/Edge/Firefox/responsive) — Platform portal | **Done**: Chromium, Edge, Firefox (15/15 pass each, identical results) + 25-combination responsive sweep (0 layout defects) — see `BROWSER-QA-REPORT.md`. Tenant portal walkthrough was outside Tasks 3–5 scope; open follow-up if required. |
| RC1-016 | **Critical** | Tenant Detail page (`/tenants/[id]`, 8 tabs) does not exist in the deployed RC1 build — only in an uncommitted local git stash from a prior session | Commit + deploy the stashed work, or formally descope Tenant Detail from RC1 |
| RC1-017 | **Critical** | Provisioning Workspace (`/provisioning`) and DID Inventory (`/did-inventory`) are unreachable on the Platform portal — not in `PORTAL_ROUTE_PREFIXES.platform`, not in the sidebar nav, and the wizard components don't exist in `HEAD` (only in the same uncommitted stash). Currently `/provisioning` on the platform portal silently redirects to `/dashboard`. **Blocks Task 2 (Provisioning Runtime Validation) as specified.** | Commit + deploy the stashed provisioning wizard + route/nav config, or formally descope and run Task 2 against the legacy tenant-portal device-provisioning flow instead |
| RC1-020 | **High** | Database integrity verification (`db-integrity-verification.sql`) could not be executed against staging Postgres from this environment — SSH to EC2 denied (no key), port 5432 not exposed publicly, and local `.env` `DATABASE_URL` points at a local dev DB, not staging | **Blocked – Environment Access, not a product defect.** See `DATABASE-INTEGRITY-REPORT.md` for the exact commands someone with EC2/SSH access can run to unblock (read-only, zero mutation risk) |

## Security / configuration

| ID | Severity | Issue | Mitigation |
|----|----------|-------|------------|
| RC1-004 | High | `DEV_AUTH_*` vars enable backdoor login if set in production | Ensure unset in production `.env`; add startup guard |
| RC1-005 | High | `TELECOM_SERVICE_AUTH_TOKEN` unset opens service auth stub | Production validator requires it; verify in deploy |
| RC1-006 | Medium | Refresh token in `localStorage` (XSS exposure) | CSP, XSS hygiene; httpOnly cookie planned post-RC1 |
| RC1-007 | Medium | Swagger defaults enabled | Set `SWAGGER_ENABLED=false` in production |
| RC1-008 | Medium | Some platform pages lack `ModuleAccessGate` (API still enforces RBAC) | Do not rely on UI-only hiding |

## Provisioning

| ID | Severity | Issue | Workaround |
|----|----------|-------|------------|
| RC1-009 | Low | Tenant notification step skipped | Manual notify tenant admin after provision |
| RC1-010 | Low | Extension cross-check warns if user lacks `PLATFORM_SUPER_ADMIN` | Use super admin for validation runs |
| RC1-011 | Low | Bulk assign sequential — slow for 10+ numbers | Batch in smaller groups |

## Platform Admin UI

| ID | Severity | Issue | Workaround |
|----|----------|-------|------------|
| RC1-018 | Low | Audit Logs page (`/audit-logs`) always fires an unconditional `useOpsAudit` query alongside `usePlatformAudit`; on the platform portal the unused one 400s (`tenantId` required, not sent) | Cosmetic console/network noise only — displayed data is correct |
| RC1-019 | Low/Medium | Login form's `onSubmit` `preventDefault()` doesn't guard against a click landing before React hydration — falls through to a native full-page GET form submit that silently discards the attempt (no credential leak; inputs have no `name` attribute) | Not reproducible at normal human typing speed; disable submit button until mounted, or use `type="button"` |

## Tooling / CI

| ID | Severity | Issue | Workaround |
|----|----------|-------|------------|
| RC1-012 | Resolved | `admin:lint` previously failed — missing ESLint plugins for `@next/next/no-img-element`, `react-hooks/exhaustive-deps` | Fixed in root `eslint.config.mjs` + plugin deps |
| RC1-013 | Low | Next.js middleware deprecation warning | Informational; migrate to proxy convention later |

## Tenant portal

| ID | Severity | Issue | Workaround |
|----|----------|-------|------------|
| RC1-014 | Medium | `/contact-center/*` routes not in tenant portal allowlist | Use supervisor/reception via allowed routes |
| RC1-015 | Low | Legacy tenant paths still in allowlist for backward compat | Prefer v2 nav paths |

## Not in RC1 scope (by design)

- Lifecycle actions: Disable, Archive, Delete tenant
- Phase 3C features
- Schema / Prisma changes
- UI redesign
