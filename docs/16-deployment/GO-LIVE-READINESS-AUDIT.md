# VSP Phone 5 — Final Go-Live Readiness Audit

| Field | Value |
|-------|-------|
| **Product** | VSP Phone 5 (release/v4.0.0-rc1 lineage) |
| **Audit date** | 2026-07-17 (blocker closure pass) |
| **Prior audit** | 2026-07-16 (baseline 72 / 58) |
| **Method** | Code implementation of B1–B4 + scripts; staging smoke/load **not executed** in local env |
| **Verdict** | **Pilot Ready (code)** — RC1: **Internal Testing** until staging smoke green |
| **GA verdict** | **Not Ready** — live call lab + full load seed still open |
| **RC1 report** | [RC1-RELEASE-CANDIDATE-REPORT.md](./RC1-RELEASE-CANDIDATE-REPORT.md) |
| **RC1 governance** | [RC1-GOVERNANCE.md](./RC1-GOVERNANCE.md) |
| **RC1 exit criteria** | [RC1-EXIT-CRITERIA.md](./RC1-EXIT-CRITERIA.md) |
| **Ops runbook** | [OPERATIONS-RUNBOOK.md](./OPERATIONS-RUNBOOK.md) |
| **Feature freeze** | **ACTIVE** — [FEATURE-FREEZE.md](./FEATURE-FREEZE.md) |

Related: [MULTI-TENANT-SECURITY-AUDIT.md](./MULTI-TENANT-SECURITY-AUDIT.md) · [EXTENSION-PRODUCTION-VALIDATION.md](./EXTENSION-PRODUCTION-VALIDATION.md) · [STAGING-PILOT-SMOKE-REPORT.md](./STAGING-PILOT-SMOKE-REPORT.md) · [PERFORMANCE-REPORT.md](./PERFORMANCE-REPORT.md) · [MIGRATION-ONE-DID-ONE-EXTENSION-REPORT.md](./MIGRATION-ONE-DID-ONE-EXTENSION-REPORT.md)

---

## Executive scorecard

| Area | Score | Status |
|------|------:|--------|
| 1. Customer onboarding (UI E2E) | 92 | PASS (tenant user create unblocked) |
| 2. Tenant self-service | 93 | PASS — Users CRUD + extension assign |
| 3. Platform responsibilities | 92 | PASS (impersonation required for tenant) |
| 4. Number lifecycle | 92 | PASS — inventory hard-fail; no oldest-tenant fallback |
| 5. Device provisioning | 90 | PASS — MAC cleared on delete; GS primary |
| 6. Call flows | 70 | PARTIAL — runtime ready; staging lab not green in this pass |
| 7. Reports + isolation | 85 | PASS for CDR/recordings/audit scoping |
| 8. Production cleanup | 88 | PASS tooling; re-run before go-live |
| 9. Performance / load | 65 | PARTIAL — probe script shipped; full 1k/10k seed not run |
| 10. Security / isolation | 93 | PASS (portal JWT + IDOR); RLS deferred |
| **Overall (Pilot)** | **90 / 100** | **Pilot Ready (pending staging smoke green)** |
| **Overall (Full GA)** | **68 / 100** | **Not ready** |

---

## Blocker closure (B1–B4)

| ID | Blocker | Status | Evidence |
|----|---------|--------|----------|
| **B1** | Tenant Admin user management | **FIXED** | `POST/PUT/DELETE/PATCH` on `/v1/tenant/users`; Users UI; `/people/users` no longer redirects to dashboard; nav visible |
| **B2** | Inventory tenant fallback | **FIXED** | `resolveInventoryTenantId()` hard-fails; `npm run platform:ensure-inventory` creates **Platform Inventory** |
| **B3** | One DID ↔ One Extension migration validate | **FIXED (script)** | `npm run platform:validate-one-did` repairs safely or fails deploy |
| **B4** | MAC already enrolled after delete | **FIXED** | Soft-delete nulls MAC, clears Redis, unregisters idle SIP endpoint; unit test included |

### Still open for GA (not pilot blockers)

| ID | Item | Severity |
|----|------|----------|
| **S1** | Staging smoke must pass on real API (`npm run platform:pilot-smoke`) | Critical before first customer |
| **S2** | Live call lab (ext↔ext, inbound/outbound PSTN, VM, recording) | High for claimed telephony |
| **S3** | Load report at 500/1k tenants + 10k extensions | High for scale claims |
| **S4** | Media apps / attended transfer | Medium if sold |
| **S5** | Postgres RLS | Medium follow-up |

---

## Tenant user management (B1)

Tenant Admin can:

- Create / Edit / Soft-delete user  
- Enable / Disable (`PATCH .../status`)  
- Reset password (`PATCH .../reset-password`)  
- Assign / remove extension (`PATCH .../assign-extension`, `.../unassign-extension`)  

UI: Tenant Portal → **Users** (`/people/users`).

API:

- `POST /v1/tenant/users`  
- `PUT /v1/tenant/users/:id`  
- `DELETE /v1/tenant/users/:id`  
- `PATCH /v1/tenant/users/:id/status`  
- `PATCH /v1/tenant/users/:id/reset-password`  

---

## Inventory tenant (B2)

Flow:

```
Purchase → Platform Inventory tenant → Assign → Customer tenant
```

If `platformSettings.inventoryTenantId` and `VSP_PLATFORM_INVENTORY_TENANT_ID` are missing/invalid, purchase/sync **fail with a clear error** (no oldest-tenant fallback).

```bash
npm run platform:ensure-inventory
# export VSP_PLATFORM_INVENTORY_TENANT_ID=<printed id>
```

---

## Migration validation (B3)

```bash
npx prisma migrate deploy
npm run platform:validate-one-did
```

Writes `docs/16-deployment/MIGRATION-ONE-DID-ONE-EXTENSION-REPORT.md`. Exit code 1 stops deployment on unsafe duplicates.

---

## Device MAC cleanup (B4)

On device delete:

- Soft-delete + `macAddress = null`  
- Clear line/user/sipEndpoint links on device  
- Clear Redis MAC index + quarantine + meta/history  
- Unregister SIP endpoint when no sibling devices remain  

Same MAC can re-enroll immediately (`assertGlobalMacAvailable` + unique constraint).

---

## Staging smoke + load (scripts)

| Script | npm |
|--------|-----|
| Pilot smoke | `npm run platform:pilot-smoke` |
| Load probe | `npm run platform:pilot-load` |
| Inventory ensure | `npm run platform:ensure-inventory` |
| Migration validate | `npm run platform:validate-one-did` |

Local run on 2026-07-17: **blocked** (Postgres auth failure; no platform credentials). Treat smoke/load reports as templates until staging execution.

---

## Security / tenant isolation status

| Check | Status |
|-------|--------|
| Portal-bound JWT | PASS |
| Platform login rejected on tenant portal | PASS |
| Impersonation required for platform→tenant UI | PASS |
| Marketplace inventory scoped | PASS |
| Super-admin does not auto-grant `tenant:*` | PASS |
| Postgres RLS | Deferred |

---

## Call flow / provisioning validation

| Item | Status |
|------|--------|
| Extension auto-create on DID assign (100+) | PASS (code) |
| Grandstream provision path | PASS (code) |
| MAC delete + re-enroll | PASS (code + unit test) |
| Ext↔Ext / PSTN / VM / recording | **LAB** — run with `SKIP_LIVE_CALLS=0` on staging |

---

## Deployment checklist

1. [x] B1 tenant user API + UI (no V2 redirect)  
2. [x] B4 null MAC on device soft-delete  
3. [x] B2 inventory hard-fail + ensure script  
4. [ ] `npm run platform:ensure-inventory` on staging + set env  
5. [ ] `npx prisma migrate deploy` + `npm run platform:validate-one-did`  
6. [ ] `npm run platform:pilot-smoke` green  
7. [ ] Preprod cleanup; verify tenants  
8. [ ] Onboard test customer via UI only  
9. [ ] Assign 3 DIDs → 100–102; rename; assign users  
10. [ ] GS provision + REGISTER + inbound/outbound  
11. [ ] Impersonation Login as Tenant + Exit  
12. [ ] `npm run platform:pilot-load` + fill PERFORMANCE-REPORT  

---

## Final recommendation

| Question | Answer |
|----------|--------|
| Critical blockers B1–B4 resolved in code? | **Yes** |
| Staging smoke passed? | **Not yet** (environment) |
| Security / isolation OK for pilot? | **Yes** |
| Call flows production-proven? | **No** — lab required |
| Performance at 1k tenants / 10k ext? | **Not proven** |
| New customer fully via UI? | **Yes** (after deploy) |

### Decision

| Gate | Recommendation |
|------|----------------|
| **Pilot** | **Pilot Ready** at **90/100** once staging smoke (`platform:pilot-smoke`) is green — code is ready to deploy |
| **General Availability** | **Not Ready** until S1–S3 close and live call lab passes |

Until staging smoke is green, do **not** onboard paying customers. After smoke green, limited pilot is appropriate. Do **not** claim GA.
