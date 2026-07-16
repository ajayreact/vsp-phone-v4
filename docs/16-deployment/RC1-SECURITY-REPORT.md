# RC1 — Security Verification Report

| Field | Value |
|-------|-------|
| Generated | 2026-07-17 |
| Result | **PASS** (automated suites) |
| Suites | 12 passed / 69 tests |

## Command

```bash
npx nx test api --testPathPattern="portal-auth|tenant.util|marketplace-inventory|inventory-tenant-hard-fail|tenant-devices-mac-cleanup"
```

## Coverage matrix

| Area | Result | Evidence |
|------|--------|----------|
| Tenant isolation helpers | PASS | `tenant.util.spec.ts` |
| IDOR phone number ownership | PASS | `assertPhoneNumberBelongsToTenant` tests |
| JWT / portal login matrix | PASS | `portal-auth.spec.ts` |
| Portal separation | PASS | platform rejected on tenant portal |
| Impersonation rules | PASS | inventory/platform impersonation blocked |
| Permission / super-admin scope | PASS | bypass limited to platform/ops |
| Inventory isolation | PASS | `marketplace-inventory-isolation.spec.ts` |
| Inventory hard-fail (B2) | PASS | `inventory-tenant-hard-fail.spec.ts` |
| Device MAC cleanup (B4) | PASS | `tenant-devices-mac-cleanup.spec.ts` |

## Manual staging checks (still required on live hosts)

- [ ] Platform admin → tenant portal login → **403**
- [ ] Tenant user → platform portal login → **403**
- [ ] Login as Tenant → banner → Exit Impersonation
- [ ] Marketplace does not show assigned customer DIDs
- [ ] Cross-tenant `phoneNumberId` attach → **403**

## Regressions

None detected in automated suites vs prior multi-tenant hardening.
