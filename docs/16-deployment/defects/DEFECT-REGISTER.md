# RC1 Defect Register

| Field | Value |
|-------|-------|
| Updated | 2026-07-17 |
| Target | AWS EC2 only |
| Stopped at | Smoke ENV-06 (DIDs) + **APP-01** hub 500 |

## Closed

| ID | Status | Summary |
|----|--------|---------|
| ENV-01 | CLOSED | Local Windows Postgres — discarded |
| ENV-03 | CLOSED | Host migrate P1001 — Compose recovery |
| ENV-04 | CLOSED | CORS/SMTP_FROM_EMAIL — `rc1-env` PASS |
| ENV-05 | CLOSED | API redeployed; login with `portal:platform` → HTTP 201 |

## Operator access

| ID | Status |
|----|--------|
| ENV-02 | Acknowledged — not an app defect |

## Active

| ID | Sev | Status | Summary | Detail |
|----|-----|--------|---------|--------|
| **ENV-06** | **P0** | **Partial** | Inventory tenant created + env set (`86403937-…`); still need settings verify, Telnyx sync ≥3 DIDs, smoke green | [20260717-ENV-06-inventory-tenant-missing.md](./20260717-ENV-06-inventory-tenant-missing.md) |
| **APP-01** | **P0** | **Open** | Tenant Extensions hub `/extensions/hub` (+ stats) → HTTP 500 | [20260717-APP-01-extensions-hub-500.md](./20260717-APP-01-extensions-hub-500.md) |

## Progress (AWS)

| Step | Status |
|------|--------|
| ensure-inventory | Ran earlier — **API settings still missing inventoryTenantId** (re-run via Compose) |
| migrate deploy | PASS |
| rc1-infra | PASS |
| rc1-env (production) | PASS |
| portal login (`portal:platform`) | PASS |
| pilot-smoke | **FAIL** — ENV-06 (B2 / Numbers / Extensions) |
| call lab | Pending |
| rc1-validate | Pending |

## Code defects

None.
