# Release Notes — VSP Phone v4.0.0 RC1 (Hardening)

| Field | Value |
|-------|-------|
| **Version** | 4.0.0-rc1 |
| **Date** | 2026-07-13 |
| **Status** | Feature freeze — hardening only |

## Summary

RC1 is the first release candidate after Platform Admin Phase 3A–3B (operational dashboard, tenant detail workspace, enterprise provisioning wizard). Engineering is **feature frozen**. This release focuses on runtime verification, security audit, and production readiness.

## Platform Admin (Phase 3A–3B)

- 4-area platform navigation (Dashboard, Tenants, DID Inventory, System)
- Tenant Detail workspace with 8 tabs
- Enterprise Provisioning Wizard at `/provisioning`
- Bulk assign: DIDs → extensions → lines → inbound routes
- Partial success handling, retry failed numbers, client logging
- Operational dashboard with quick actions

## Stabilization (Phase 3B.1 / RC1 hardening)

- Partial provisioning success no longer marks job as failed
- Retry merges prior successes; retries only failed DIDs
- 120s bulk assign timeout; improved error messages
- Expanded React Query cache invalidation after provision
- Database integrity SQL script
- RC1 operational documentation package

## Builds verified

| Target | Status |
|--------|--------|
| `nx run admin:build` | Pass |
| `nx run api:build` | Pass |
| `nx run admin:lint` | Fail (ESLint plugin config — see Known Issues) |

## API health (staging)

```
GET https://api.vspphone.com/api/health → 200 ok (remediation-complete)
```

## Upgrade notes

- No database migrations in RC1
- No breaking API changes
- Redeploy API + Admin containers
- Verify env vars per `docs/14-rc1/ENVIRONMENT-VARIABLES.md`

## Full feature list

See `docs/12-release/RELEASE_NOTES_v4.0.0_RC1.md` for complete Phase 0–20 capability summary.

## Known issues

See [KNOWN-ISSUES.md](./KNOWN-ISSUES.md).
