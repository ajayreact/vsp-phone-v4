# RC1 Known Issues

| Field | Value |
|-------|-------|
| **Version** | v4.0.0-rc1 |
| **Updated** | 2026-07-13 |

## Release blockers

| ID | Severity | Issue | Workaround |
|----|----------|-------|------------|
| RC1-001 | **Critical** | Admin BFF routes (`/api/bff/observability/*`) skip middleware auth | **Fixed in code** — deploy + run `verify-bff-security.cjs` |
| RC1-002 | **High** | Live E2E workflows not verified — no platform credentials in CI/local `.env` | Set `PLATFORM_EMAIL`/`PLATFORM_PASSWORD`; run verification scripts |
| RC1-003 | **High** | Browser QA (Chrome/Edge/Firefox/responsive) not completed | Manual QA pass required before production |

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

## Tooling / CI

| ID | Severity | Issue | Workaround |
|----|----------|-------|------------|
| RC1-012 | Medium | `nx run admin:lint` fails — missing ESLint plugins for `@next/next/no-img-element`, `react-hooks/exhaustive-deps` | Build passes; fix ESLint config post-RC1 |
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
