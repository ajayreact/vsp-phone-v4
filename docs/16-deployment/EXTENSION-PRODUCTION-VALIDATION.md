# Extension Module — Production Validation

**Feature:** Extension-as-endpoint (VSP Phone 5)  
**Status:** Hardened for production (1 DID ↔ 1 Extension, inactive lifecycle, reassignment isolation)

---

## Rules enforced

| Rule | Enforcement |
|------|-------------|
| One DID = One Extension | Partial unique index `phone_numbers_one_line_active_uidx` + API `assertCanBindDidToLine` |
| One Extension = One Primary DID | Same index + hub `phoneNumbers.take: 1` |
| DID cannot attach to multiple extensions | API ConflictException + DB unique on `line_id` |
| Extension number unique per tenant | `@@unique([tenantId, extension])` (existing) |
| Unassign DID | Keep extension; set `Line.status = INACTIVE`; soft-delete inbound route |
| Reassign to another tenant | Prior line Inactive; routes scrubbed; new tenant gets next free extension (100…) |
| Configure locks | Extension number + Assigned DID not editable via tenant Configure/API update |

---

## Backfill (existing tenant DIDs)

On `GET /v1/tenant/extensions/hub`, orphan DIDs (no line, no historical route/assignment) receive:

| Extension | Default name | Stub |
|-----------|--------------|------|
| 100, 101, 102… | `Extension N` | SIP + WEBRTC device + voicemail + policies |

**Idempotent:** Unassigned / reassigned DIDs are **not** recreated (historical inbound route or lined assignment skips backfill).

### Expected for three DIDs (first load)

| Extension | Name | Assigned Number |
|----------:|------|-----------------|
| 100 | Extension 100 | +13136505581 |
| 101 | Extension 101 | +13136505770 |
| 102 | Extension 102 | +13136506292 |

Refresh Extensions once after deploy. Confirm no duplicates.

---

## Migration

```bash
npx prisma migrate deploy
# includes: 20260717040000_one_did_one_extension
```

Dedupes multi-DID lines / multi-route DIDs before creating unique indexes.

---

## Manual smoke checklist

1. New tenant + one DID → Extension **100** auto-created  
2. Second DID → **101**  
3. Third DID → **102**  
4. Rename `Extension 100` → `Reception` (Configure → User Name)  
5. Assign user “Ajay Oguri”  
6. Provision desk phone  
7. Register softphone  
8. Remove DID → extension **Inactive**, history retained  
9. Platform reassigns DID to Tenant B → Tenant A stays Inactive; B gets new extension; no cross-tenant routes  
10. No duplicate extensions / orphan active routes  

---

## Audit actions

| Event | Action |
|-------|--------|
| Extension created | `pbx.extension.create` / `pbx.extension.full_auto_provision` |
| Renamed | `pbx.extension.rename` |
| User assigned / removed | `pbx.extension.user_assign` / `pbx.extension.user_remove` |
| DID assigned | `pbx.did.assign` / `telnyx.number.assigned` |
| DID unassigned | `pbx.extension.did_unassign` / `telnyx.number.unassigned` |
| Device | `pbx.device.*` |

---

## Automated tests

```bash
npx nx test api --testPathPattern="did-extension-binding|extension-auto-provision.util"
```

---

## Configure screen (tenant admin)

**Editable:** User Name, Assigned User, SIP view, Device, Voicemail, Recording, Call Features, Permissions, CNAM/E911 metadata  

**Not editable:** Extension Number, Assigned DID (platform workflow / Remove DID only)
