# RC1 Blocker Resolution — Database Integrity Report

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Status** | **Script ready — live execution blocked** |
| **Date** | 2026-07-13 |

## Script

`scripts/platform/db-integrity-verification.sql` — full detail queries  
`scripts/platform/run-db-integrity.cjs` — summary dashboard runner

## Execution attempt

```
node scripts/platform/run-db-integrity.cjs
→ password authentication failed for user "vsp"
```

Local `.env` `DATABASE_URL` does not connect to staging/production PostgreSQL from this environment.

## Checks (when run against staging DB)

| Check | Description |
|-------|-------------|
| orphan_dids | Assigned/active DIDs with missing/deleted tenant |
| orphan_extensions | Extensions without valid line or tenant mismatch |
| orphan_lines | Lines without extension or invalid tenant |
| orphan_inbound_routes | Routes with missing tenant |
| duplicate_extension_nums | Same extension number twice per tenant |
| duplicate_did_numbers | Same number twice per tenant |
| did_line_extension_chain_breaks | DID → line → extension tenant chain broken |

## Run before RC1 approval

```bash
# On staging host or with staging DATABASE_URL
psql "$DATABASE_URL" -f scripts/platform/db-integrity-verification.sql

# Or summary only:
node scripts/platform/run-db-integrity.cjs
```

**Pass criteria:** All summary counts = 0.

## Remediation

If failures found: fix data defects only (reassign/release orphans). No schema changes per RC1 scope.
