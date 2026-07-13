# RC1 Task 3 — Database Integrity Verification

| Field | Value |
|-------|-------|
| **Status** | **Blocked – Environment Access** |
| **Date** | 2026-07-13 |
| **Target** | Staging PostgreSQL (EC2 `vsp-postgres` container, behind `admin.vspphone.com` / `api.vspphone.com`) |
| **Script** | `scripts/platform/db-integrity-verification.sql` (read-only; not modified) |

## Why this is blocked, not a product finding

This agent has no network path to the staging PostgreSQL instance:

1. **SSH to the EC2 host is not available.** `ssh -o BatchMode=yes -o ConnectTimeout=5 ubuntu@32.196.41.160` → `Permission denied (publickey)`. No key for this host is configured in this environment (same constraint hit in the earlier BFF verification work, where the user ran deploy commands manually on the instance).
2. **Direct DB access is not exposed.** `docker-compose.yml` publishes Postgres as `${POSTGRES_PORT:-5432}:5432` on the host, but `Test-NetConnection 32.196.41.160:5432` → `TcpTestSucceeded: False` — the security group / firewall does not expose 5432 publicly (correct, expected hardening).
3. **No local `psql` client** is installed in this environment, so even if the port were reachable, there's no driver to run against it from here (Node.js has no ambient Postgres client either — would need `pg` installed, still moot without network access).
4. There is no BFF/API route that executes arbitrary read-only SQL — by design, and correctly so; this is not a gap to fix.
5. **Local `DATABASE_URL` does not reach staging either** — `node scripts/platform/run-db-integrity.cjs` (which uses `pg` + the local `.env` `DATABASE_URL`) fails with `password authentication failed for user "vsp"`, because that URL points at `localhost:5432/vsp_phone_v4` (this machine's own dev Postgres), not the staging instance. There is no staging `DATABASE_URL` available to this agent to substitute in.

This is **exactly** the "cannot be reached / permissions prevent execution" case called out in the task — recorded as **Blocked – Environment Access**, not a product defect, and no data was modified (no destructive or mutating action was attempted).

## How to unblock (no code change required)

Someone with EC2 access runs the existing, unmodified script against the running `vsp-postgres` container and pastes the output back. From `/opt/vsp-phone-v4` on the EC2 host:

```bash
docker exec -i vsp-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < scripts/platform/db-integrity-verification.sql
```

(Uses the container's own `POSTGRES_USER`/`POSTGRES_DB` env vars, so it's correct regardless of the exact staging values — no need to reveal credentials.) This is purely `SELECT`-based (see script header: "Run read-only against PostgreSQL") — safe to run against the live staging DB with zero risk of mutation.

Alternatively, grant this agent either:
- SSH access to the EC2 host (a public key to add to `~/.ssh/authorized_keys` for `ubuntu@<host>`), or
- A temporary, read-only `DATABASE_URL` reachable from this machine (e.g., a short-lived security-group rule scoped to this IP, or an SSH tunnel) — in which case `DATABASE_URL=<staging-url> node scripts/platform/run-db-integrity.cjs` will print a ready-made PASS/FAIL summary table directly (it's the same summary query as the script above, run through `pg`, no `psql` client needed).

## Checks pending execution (from the script)

| Check | What it detects | Result |
|---|---|---|
| `orphan_dids` | Active/assigned DIDs whose tenant is missing or soft-deleted | **Pending** |
| `orphan_extensions` | Extensions with no live line, no live tenant, or tenant mismatch vs. their line | **Pending** |
| `orphan_lines` | Lines with no live tenant or no live extension attached | **Pending** |
| `orphan_inbound_routes` | Inbound routes whose tenant is missing or soft-deleted | **Pending** |
| `duplicate_extension_nums` | Same `(tenant_id, extension)` appearing more than once (excluding soft-deleted) | **Pending** |
| `duplicate_did_numbers` | Same `(tenant_id, number)` appearing more than once (excluding soft-deleted) | **Pending** |
| `did_line_extension_chain_breaks` | DID→Line→Extension→Route chain integrity (tenant consistency across the whole chain) | **Pending** |
| Multiple open `number_assignments` per DID | A DID with more than one currently-open (`effective_to IS NULL`) assignment — would indicate the `assign()` transaction's "close old assignment" step failed for some row | **Pending** |

## Severity / RC1 blocking assessment (provisional)

Cannot be assessed until the script runs. Once results are provided, this report will be updated in place with:
- PASS/FAIL per check
- Affected record IDs for any non-zero count
- Severity (a single orphan/duplicate is likely Medium; a systemic chain-break pattern affecting many tenants would be Critical)
- Explicit RC1 block/no-block call per finding

## Repair policy

Per instructions, **no data will be modified** without explicit authorization. If any check comes back non-zero, this report will list the affected IDs and a proposed read-only-first remediation query (e.g., `UPDATE ... WHERE id IN (...)` shown but **not executed**) for review before anything is run.
