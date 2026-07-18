# Defect — Tenant Lifecycle Migration (enum 55P04)

| Field | Value |
|-------|-------|
| Date | 2026-07-18 |
| ID | **MIGRATE-01** |
| Severity | **P0** |
| Migration | `20260718100000_tenant_lifecycle_reset` |
| Database error | `55P04` unsafe use of new value `DELETED` |
| Status | Fixed by split migrations A/B |

## Root cause

PostgreSQL forbids using a newly added enum label in the **same transaction** that added it. The original migration ran `ALTER TYPE … ADD VALUE 'DELETED'` and then `UPDATE tenants SET status = 'DELETED'` inside one Prisma transaction.

## Fix

| Migration | Contents |
|-----------|----------|
| `20260718100000_tenant_lifecycle_reset` | **A** — `ADD VALUE` for `DELETED` / `UNASSIGNED` only |
| `20260718105000_tenant_lifecycle_reset_data` | **B** — `available` column + data UPDATEs |

## Recovery (EC2 / production)

Do **not** `DELETE` from `_prisma_migrations`. Do **not** drop data.

```bash
cd /opt/vsp-phone-v4
git pull --ff-only origin release/v4.0.0-rc1
source scripts/platform/ec2-compose-env.sh

# Clear failed attempt (failed row has finished_at NULL)
$COMPOSE run --rm --no-deps \
  -v /opt/vsp-phone-v4:/repo \
  -w /repo \
  -e DATABASE_URL="postgresql://vsp:vsp@postgres:5432/vsp_phone_v4?schema=public" \
  api npx prisma migrate resolve --rolled-back 20260718100000_tenant_lifecycle_reset

$COMPOSE run --rm --no-deps \
  -v /opt/vsp-phone-v4:/repo \
  -w /repo \
  -e DATABASE_URL="postgresql://vsp:vsp@postgres:5432/vsp_phone_v4?schema=public" \
  api npx prisma migrate deploy
```

If resolve says the migration is already rolled back / not found as failed, skip resolve and only run `migrate deploy`.
