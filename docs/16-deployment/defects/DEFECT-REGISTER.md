# RC1 Defect Register

| Field | Value |
|-------|-------|
| Governance | [RC1-GOVERNANCE.md](../RC1-GOVERNANCE.md) |
| Updated | 2026-07-17 |
| Certification target | **AWS EC2 only** |
| Stopped at | `npx prisma migrate deploy` → **ENV-03** |

## Closed

| ID | Sev | Status | Summary |
|----|-----|--------|---------|
| **ENV-01** | P0 | **CLOSED** | Local Windows Postgres — discarded; do not reopen |

## Operator access (not an app defect)

| ID | Status | Summary |
|----|--------|---------|
| ENV-02 | Acknowledged | Agent SSH limitation — operator running on EC2 |

## Active blockers

| ID | Sev | Status | Summary | Detail |
|----|-----|--------|---------|--------|
| **ENV-03** | **P0** | **Open** | Host `npx prisma migrate deploy` → P1001 `localhost:5432` unreachable; DB is on Docker network | [20260717-ENV-03-prisma-migrate-localhost.md](./20260717-ENV-03-prisma-migrate-localhost.md) |

## Progress (AWS)

| Step | Status |
|------|--------|
| `npm run platform:ensure-inventory` | PASS |
| `npx prisma migrate deploy` (host) | **FAIL** → ENV-03 |
| Remaining phases | Not started |

## Code defects

None.
