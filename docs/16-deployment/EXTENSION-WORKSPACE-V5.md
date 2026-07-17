# Extension Workspace — VSP Phone 5 UX

| Field | Value |
|-------|-------|
| Status | **Authorized exception** (product-owner) |
| Track | VSP Phone 5 UX (parallel to RC1 certification) |
| Date | 2026-07-17 (revised) |
| Freeze | [FEATURE-FREEZE.md](./FEATURE-FREEZE.md) remains ACTIVE for unrelated work |

## Exception

RC1 feature freeze forbids UI redesigns and new workflows. This document records a **written product-owner exception** to implement the Extension Workspace IA:

- Extension is the primary business object; each row = Ext | Name | DID | Device | Status | Actions
- Platform Admin owns raw numbers and assigns them to a tenant (auto-provisions the extension)
- Tenant Admin manages everything for one extension from a single Configure modal — General, DID,
  Device, Provisioning, Voicemail, Call Features, Recording, Permissions, Activity
- No separate pages for extension assignment, DID assignment, or device assignment — those actions
  live inside Configure
- Manual **Add Extension** is kept, scoped to internal extensions with no DID (revised — see below)
- Tenant admins may Assign / Change / Remove a DID on an extension from Configure → DID, scoped to
  numbers already owned by their tenant (revised — see below)

**RC1 exit criteria are unchanged.** This work must not block or rewrite ENV/APP certification gates
unless they conflict; smoke scripts that relied on the earlier "tenant assign disabled" behavior
should use the reinstated `POST /v1/tenant/dids/:id/assign` endpoint again.

### Revision (2026-07-17)

An earlier pass of this exception removed tenant "Add Extension" entirely and returned 403 on all
tenant DID-assign calls. Product guidance reversed both, while keeping the "no duplicate pages"
principle:

- **Add Extension** is back on the hub, but only creates an internal extension (no DID) — DID-bearing
  extensions still only come from Platform Admin's tenant assignment (auto-provision).
- **Configure → DID** now supports Assign / Change / Remove, searching the tenant's own unassigned
  numbers (numbers Platform Admin already gave the tenant). This is not a carrier marketplace flow —
  Platform Admin still owns raw number acquisition. `assertCanBindDidToLine` still enforces
  One DID ↔ One Extension server-side; "Change DID" unassigns the current number before binding the
  new one.
- Number Inventory (`/phone-numbers/my-numbers`) stays **read-only** (DID / Assigned Extension /
  Extension Name / Status + Remove DID + "Open extension" deep link) — assignment UI lives only in
  Configure, per "no separate DID page for normal administration."

## Model

```
Platform Admin → assigns raw DID to tenant
              → auto-creates Extension (100…) + SIP + WebRTC + Voicemail + policies

Tenant Admin  → Extensions hub (Ext | Name | DID | Device | Status | Configure)
              → Configure modal: General, DID (assign/change/remove from tenant's own numbers),
                Device (add/remove Mobile App, WebRTC, or hardware brand + MAC), Provisioning
                (vendor/model/MAC/URL/QR/regenerate/reboot), Voicemail, Call Features, Recording,
                Permissions, Activity
              → Add Extension → internal extension, no DID
              → Number Inventory → read-only view + Remove DID
```

## Related code

- Platform assign: `apps/api/src/modules/carrier-admin/services/telnyx-numbers.service.ts`
- Auto-provision: `apps/api/src/modules/tenant-portal/services/extension-auto-provision.service.ts`
- Tenant DID assign (reinstated, tenant-scoped): `apps/api/src/modules/tenant-portal/controllers/tenant-dids.controller.ts`
- Configure modal: `apps/admin/src/components/modules/extensions/ExtensionConfigureModal.tsx`
- Hub: `apps/admin/src/components/modules/extensions/ExtensionsHubContent.tsx`
- Number Inventory (read-only): `apps/admin/src/components/modules/phone-numbers/MyNumbersContent.tsx`

## Tenant UX checklist

- [x] Add Extension on hub (internal, no-DID only)
- [x] Configure → DID: Assigned DID, Assign/Change DID, Remove DID, Search available numbers
- [x] Configure tabs: General, DID, Device, Provisioning, Voicemail, Call Features, Recording, Permissions, Activity
- [x] Device tab: Add/Remove Device — Mobile App, WebRTC, Grandstream, Yealink, Fanvil, Cisco, Poly, Snom
- [x] Provisioning tab: Vendor/Model/MAC/Provision URL/Copy/QR/Regenerate/Reboot
- [x] Number Inventory: DID / Extension / Name / Status + Remove DID (still read-only for normal admin)
- [x] No separate pages for extension/DID/device assignment — all inside Configure
- [x] Provision Employee wizard retired → Extensions workspace
