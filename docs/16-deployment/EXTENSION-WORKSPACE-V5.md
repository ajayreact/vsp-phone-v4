# Extension Workspace — VSP Phone 5 UX

| Field | Value |
|-------|-------|
| Status | **Authorized exception** (product-owner) |
| Track | VSP Phone 5 UX (parallel to RC1 certification) |
| Date | 2026-07-17 |
| Freeze | [FEATURE-FREEZE.md](./FEATURE-FREEZE.md) remains ACTIVE for unrelated work |

## Exception

RC1 feature freeze forbids UI redesigns and new workflows. This document records a **written product-owner exception** to implement the Extension Workspace IA:

- Extension is the primary business object
- Platform Admin owns numbers and assignment
- Tenant Admin manages extensions via one Configure surface
- Tenant Number Inventory is read-only (+ Remove DID)
- No tenant “Add Extension” or assign-DID workflow

**RC1 exit criteria are unchanged.** This work must not block or rewrite ENV/APP certification gates unless they conflict; smoke scripts that relied on tenant DID assign / Add Extension will need updates under this track.

## Model

```
Platform Admin → assigns DID to tenant
              → auto-creates Extension (100…) + SIP + WebRTC + Voicemail + policies

Tenant Admin  → Extensions hub + Configure modal (identity, user, devices, VM, …)
              → Number Inventory (read-only view / Remove DID)
```

## Related code

- Platform assign: `apps/api/src/modules/carrier-admin/services/telnyx-numbers.service.ts`
- Auto-provision: `apps/api/src/modules/tenant-portal/services/extension-auto-provision.service.ts`
- Tenant DID assign (disabled): `apps/api/src/modules/tenant-portal/controllers/tenant-dids.controller.ts`
- Configure modal: `apps/admin/src/components/modules/extensions/ExtensionConfigureModal.tsx`
- Hub: `apps/admin/src/components/modules/extensions/ExtensionsHubContent.tsx`
- Number Inventory (read-only): `apps/admin/src/components/modules/phone-numbers/MyNumbersContent.tsx`

## Tenant UX checklist

- [x] No Add Extension on hub
- [x] No tenant Assign DID drawer
- [x] Number Inventory: DID / Extension / Name / Status + Remove DID
- [x] Configure modal tab order for &lt;2 min onboard
- [x] Desk Phones demoted to inventory
- [x] Provision Employee wizard retired → Extensions workspace
