# Multi-Tenant Security Audit

**Date:** 2026-07-16  
**Scope:** Portal-bound auth, impersonation, tenant IDOR / inventory isolation  
**Status:** Hardening implemented for SaaS production readiness (Phase 1–3 + deliverables)

---

## Findings → severity → status

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| MT-01 | Hostname selected UI only; login accepted any valid user on any portal | Critical | **Fixed** — login requires `portal`; JWT carries `portal` claim |
| MT-02 | `platform:super_admin` bypassed all RBAC including `tenant:*` | Critical | **Fixed** — bypass limited to `platform:*` / `ops:*`; impersonation grants tenant plane |
| MT-03 | Platform Admin could sign into Tenant Portal with same password | Critical | **Fixed** — tenant portal login rejects super-admin; **Login as Tenant** only |
| MT-04 | No impersonation path for platform → tenant support | High | **Fixed** — `POST /v1/platform/tenants/:id/impersonate` + handoff exchange/exit |
| MT-05 | Marketplace inventory listed available numbers across tenants | High | **Fixed** — inventory query scoped to inventory tenant + unassigned only |
| MT-06 | `phoneNumberId` FKs on lines/routes/IVR/ring groups without ownership check | High | **Fixed** — `assertPhoneNumberBelongsToTenant` on create/update |
| MT-07 | Firmware approve/schedule by id without tenant scope | Medium | **Fixed** — lookups scoped to `tenantId` or shared (`null`) catalog |
| MT-08 | Super-admin cleared `tenantId` on `/v1/users` and `/v1/extensions` lists | High | **Fixed** — always JWT `tenantId`; service rejects missing tenantId |
| MT-09 | Tokens shared across portals on localhost / same host | Medium | **Fixed** — portal-scoped storage keys `vsp.{portal}.*` |
| MT-10 | No PostgreSQL RLS backstop | Medium | **Deferred** — ADR-002; helper + high-risk path guards shipped |
| MT-11 | Cookie HttpOnly / BFF for all tokens | Low | **Deferred** — portal JWT + scoped storage first |

---

## Production readiness checklist

### Portal login matrix

- [ ] `admin@…` on `https://tenant.vspphone.com/login` → **403** with clear error (not a dashboard)
- [ ] Tenant user on `https://admin.vspphone.com/login` → **403**
- [ ] Platform user on `https://admin.vspphone.com/login` → success, platform nav only
- [ ] Tenant user on `https://tenant.vspphone.com/login` → success, tenant nav only
- [ ] Ops user on ops host → success (if ops portal deployed)

### Impersonation

- [ ] Platform → Tenants → **Login as Tenant** opens tenant portal with banner
- [ ] Impersonation session sees **only** that tenant’s DIDs / extensions / users
- [ ] **Exit Impersonation** returns to platform `/tenants` with restored platform session
- [ ] Handoff codes expire (~90s) and are one-time use
- [ ] Cannot impersonate `platform` / inventory tenants

### IDOR / isolation smoke

- [ ] Marketplace inventory does not show another tenant’s assigned numbers
- [ ] Attaching another tenant’s `phoneNumberId` to a line/route/IVR → **403**
- [ ] Firmware approve with another tenant’s release id → **404**
- [ ] `/v1/users` and `/v1/extensions` never return cross-tenant rows for a tenant JWT

### Pre-prod cleanup

- [ ] Run `node scripts/platform/preprod-cleanup.cjs --sql-only --confirm` (or full mode with PLATFORM credentials)
- [ ] Confirm only intended tenants remain; devices/Redis MAC index clean  
  See [PREPROD-CLEANUP.md](./PREPROD-CLEANUP.md)

### Indexes / ops

- [ ] Confirm DB indexes on `(tenantId, deletedAt)` for hot tenant tables (extensions, devices, phone_numbers)
- [ ] Audit log shows `platform.tenant.impersonate.start` / `.exit`

### Automated tests

```bash
npx nx test api --testPathPattern="portal-auth|tenant.util|marketplace-inventory"
```

Covered:

- Platform user login on tenant portal → rejected (matrix unit test)
- Tenant user login on platform portal → rejected
- Super-admin does not auto-grant `tenant:*` without impersonation
- Impersonation JWT binds to target `tenantId`
- Marketplace filter excludes other tenants’ numbers
- `assertPhoneNumberBelongsToTenant` IDOR guard

---

## Architecture (post-fix)

```text
Login(portal) → JWT { sub, tenantId, email, portal, impersonatorUserId? }
                 │
                 ├─ portal=platform → /v1/platform/** only
                 ├─ portal=ops      → /v1/ops/** (+ limited carrier paths)
                 └─ portal=tenant   → /v1/tenant/**
                       └─ if impersonatorUserId set: tenant RBAC via impersonation grant
```

**Default:** Platform Admin enters Tenant Portal **only** via impersonation. No shared-password login.

---

## Follow-ups (out of scope this pass)

1. PostgreSQL Row Level Security (ADR-002) as defense-in-depth  
2. Broader `TenantScopedPrisma` adoption across all services  
3. HttpOnly cookie / BFF token transport for admin UI  
4. Per-tenant firmware approval copies (avoid claiming shared catalog rows)
