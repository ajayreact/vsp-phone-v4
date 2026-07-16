# Final Provisioning Audit — Automatic Extension-First Provisioning

| Field | Value |
|-------|-------|
| **Version** | v4.0.0-rc1 |
| **Date** | 2026-07-16 |
| **Scope** | Automatic Extension-First Provisioning + RC1 integrity hardening (S9 / S10 / S11) |
| **Method** | Static code review + unit tests + build verification |
| **Constraint** | Bug fixes only — no UI redesign, navigation, or workflow changes |

## Executive summary

Happy-path Automatic Extension-First Provisioning remains intact. The three production-integrity blockers from the prior audit have been **fixed**:

| ID | Issue | Status |
|----|-------|--------|
| **S9** | Extension delete left orphan PBX resources | **PASS** |
| **S10** | Split transactions → partial provision orphans | **PASS** |
| **S11** | Concurrent allocation races + silent bulk reuse | **PASS** |

**Final recommendation: READY FOR RC1**

---

## Build / test evidence (this pass)

| Check | Result |
|-------|--------|
| `nx run api:test` | **PASS** — 14/14 |
| `nx run api:build` | **PASS** |
| Live Telnyx staging mutation | Not required for this hardening sign-off (code + unit verified); resume Task 2 when carrier approval allows |

---

## Scenario results

### Scenario 1 — Assign 3 DIDs → 101 / 102 / 103

| Result | **PASS** |

Unchanged happy path: omit extension → allocate from 101 under tenant advisory lock → full stub + DID + route in one transaction.

---

### Scenario 2 — Tenant dashboard counts

| Result | **PASS** (display caveat unchanged) |

Hub stats: Extensions / assigned DIDs / Needs Setup (`unassignedExtensions`). Dashboard V2 still surfaces Needs Setup count as “Unassigned extensions” in activity text; Extensions hub has Needs Setup KPI.

---

### Scenario 3 — Extensions page Needs Setup + Configure

| Result | **PASS** |

---

### Scenario 4 — Number Inventory mapped; Change not Assign

| Result | **PASS** |

---

### Scenario 5 — Configure business fields only (primary path)

| Result | **PASS** |

---

### Scenario 6 — Add Extension → 104 without DID

| Result | **PASS** |

---

### Scenario 7 — Later DID attach to existing 104

| Result | **PASS** |

Explicit `extension` or next-free landing on 104 reuses via idempotent `ensureFullyProvisionedExtension`.

---

### Scenario 8 — Bulk Assign 25 / no silent reuse

| Result | **PASS** |

**Fix:** `resolveBulkExtensionTarget` + allocate-under-lock:

- `extensions[i]` → explicit target (intentional reuse allowed).
- `startExtension` / blank → **next free ≥ base**, skipping taken numbers (e.g. 101–103 exist + start at 101 → 104, 105, …).

Unit coverage: skips already-taken when start overlaps.

---

### Scenario 9 — Extension delete cleanup

| Result | **PASS** |

**Implementation:** [`TenantExtensionsService.remove`](apps/api/src/modules/tenant-portal/services/tenant-extensions.service.ts)

In one transaction:

1. Close `NumberAssignment`, soft-delete inbound routes (by DID / destination extension / line), clear `phoneNumber.lineId`.
2. Soft-delete devices (clear `sipEndpointId`), soft-delete SIP endpoints.
3. Soft-delete voicemail, caller ID, call policy, recording policy, telephony settings, presence.
4. Soft-delete line.
5. Soft-delete extension and **tombstone** the number (`101__del__{id}`) so `@@unique([tenantId, extension])` frees **101** for reuse.

---

### Scenario 10 — Atomic provisioning

| Result | **PASS** |

**Implementation:** [`TelnyxNumbersService.assign`](apps/api/src/modules/carrier-admin/services/telnyx-numbers.service.ts)

Single `$transaction` (60s timeout):

1. `pg_advisory_xact_lock` per tenant  
2. Allocate (if needed)  
3. `ensureFullyProvisionedExtension(..., tx)` — Line / Extension / SIP / VM / policies / device  
4. DID ownership + `NumberAssignment` + inbound route  

Any failure rolls back the entire unit — no orphan PBX stub without DID bind (and vice versa within the DB unit). Carrier meta persist remains post-commit (non-PBX bookkeeping).

---

### Scenario 11 — Concurrency

| Result | **PASS** |

**Implementation:** `ExtensionAutoProvisionService.lockTenantExtensionAllocation` → `pg_advisory_xact_lock(k1, k2)` derived from tenant UUID, held for the assign transaction.

Concurrent assigns for the same tenant serialize allocation + create. Unique constraint remains a backstop; advisory lock prevents allocate-then-collide races.

---

### Scenario 12 — Regression

| Result | **PASS** |

Hardening limited to delete path, assign/bulkAssign transactionality, and allocation helpers. No navigation / IVR / queue / schema changes.

---

## Code review (post-hardening)

| Topic | Finding | Severity |
|-------|---------|----------|
| Delete orphans | Coordinated soft-delete + DID unassign + tombstone | Resolved |
| Atomic assign | One DB transaction for stub + DID + route | Resolved |
| Allocation races | Tenant advisory xact lock | Resolved |
| Bulk reuse | Gap-aware allocate; explicit `extensions[]` only for intentional target | Resolved |
| Extension reuse after delete | Tombstone frees unique key | Resolved |
| Add Extension stub gap | Still lighter than Platform full provision (by design) | Low / accepted |

---

## Risks (residual, non-blocking)

1. **Live carrier validation** of Scenarios 1–8 still pending external Telnyx approval (operational, not a code defect).
2. **Dashboard labeling:** Needs Setup count on V2 dashboard is “Unassigned extensions” wording — cosmetic.
3. **Advisory locks** require PostgreSQL (production target). Not applicable to non-Postgres test doubles.
4. Soft-deleted tombstone rows remain in DB until a future purge job (acceptable for RC1).

---

## Remaining issues

None that block RC1 for this capability. Resume staging Task 2 (Telnyx batches) when approved.

---

## Final recommendation

# READY FOR RC1

S9, S10, and S11 now **PASS**. Happy-path auto-provisioning, delete cleanup, atomic assign, concurrency-safe allocation, and non-silent bulk assignment satisfy the audit criteria. Residual items are operational (live Telnyx) or cosmetic, not integrity blockers.
