# RC1 Defect Register

| Field | Value |
|-------|-------|
| Governance | [RC1-GOVERNANCE.md](../RC1-GOVERNANCE.md) |
| Updated | 2026-07-17 |
| Certification target | **AWS EC2 only** (localhost discarded) |
| Agent posture | **Standing by** for operator EC2 command output |

## Closed

| ID | Sev | Status | Summary |
|----|-----|--------|---------|
| **ENV-01** | P0 | **CLOSED** | Local Windows Postgres — discarded from RC; do not reopen |

## Operator access (not an application defect)

| ID | Sev | Status | Summary |
|----|-----|--------|---------|
| **ENV-02** | — | **Operator access limitation** | Agent cannot SSH / lacks AWS session; not an app bug. Certification proceeds when operator runs the sequence **on EC2** and pastes output. |

## Application / environment defects (from AWS runs)

| ID | Sev | Status | Summary |
|----|-----|--------|---------|
| — | — | **None yet** | Awaiting operator EC2 execution |

## Process

When operator pastes AWS command output:

1. If success → continue to next phase.  
2. If failure → stop → new ENV-0x defect → root cause → minimum recovery → wait for rerun.  
3. Never reopen ENV-01. Never use localhost.
