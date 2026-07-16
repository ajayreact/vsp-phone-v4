# VSP Phone 5 — Pre-Production Cleanup

Clear development leftovers before production cutover: test tenants/users, stale device MAC enrollment, and Redis provisioning indexes.

## Safety

| Kept | Removed |
|------|---------|
| Platform | `verify-*`, `signoff-*`, `ext-e2e-*` |
| VSP INTERNAL | `test-*`, `temp-*`, `demo-*`, `sandbox-*` |
| Inventory tenant | Matching “Verify / Signoff / Test / Demo” names |
| Production customers | Test users (Verify Admin, Signoff Admin, …) |

Soft-delete only. `audit_logs` are preserved.

## Prerequisites

```bash
cd /opt/vsp-phone-v4
git fetch origin && git checkout release/v4.0.0-rc1 && git pull origin release/v4.0.0-rc1

set -a && source .env && set +a
# API mode needs PLATFORM_EMAIL / PLATFORM_PASSWORD (or SUPER_ADMIN_*)
# If those are missing, use --sql-only (recommended on EC2)
```

Do **not** rely on `source .env` if it prints `command not found` — that means `.env` has invalid bash syntax. The Node script loads `.env` itself; for `--sql-only` no login is required.

Deploy API/admin first if you also need multi-DID UI (see below).

## 1. Preview

```bash
# Preferred when platform password is not in .env
node scripts/platform/preprod-cleanup.cjs --dry-run --sql-only
```

Review:

- Keep list (Platform / VSP INTERNAL)
- Purge targets
- Active device MAC count

## 2. Execute

```bash
node scripts/platform/preprod-cleanup.cjs --confirm --sql-only
```

Or, if credentials are exported:

```bash
export PLATFORM_EMAIL="…"
export PLATFORM_PASSWORD="…"
node scripts/platform/preprod-cleanup.cjs --confirm
```

What it does:

1. Soft-deletes temp tenants (devices, extensions, lines, users, tenant) and returns DIDs to inventory when possible  
2. Soft-deletes test users on remaining tenants  
3. Soft-deletes **all** remaining active devices and clears Redis `vsp:prov:mac:*` / quarantine keys so enroll no longer returns **MAC already enrolled**

### Options

```bash
# Tenants/users only — keep existing device rows
node scripts/platform/preprod-cleanup.cjs --confirm --skip-provisioning-reset

# Only wipe Redis MAC indexes (no SQL device soft-delete)
node scripts/platform/preprod-cleanup.cjs --confirm --redis-mac-only
```

## 3. Redeploy API + Admin (multi-DID + MAC clear on delete)

```bash
export COMPOSE="docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.host-db.yml \
  --env-file .env"

export API_DOCKER_TARGET=production
export ADMIN_DOCKER_TARGET=production

$COMPOSE build --no-cache api admin
$COMPOSE up -d --force-recreate --no-deps api admin
curl -sk https://127.0.0.1:3000/api/ready
```

## 4. Verify

| Check | How |
|-------|-----|
| No MAC already enrolled | Enroll a desk phone again after cleanup |
| Multiple DIDs on extension | Tenant → Extensions → Assigned Numbers column lists all |
| No test tenants | Platform → Tenants |
| No test users | Platform → Users |
| Redis MAC empty | `$COMPOSE exec -T redis redis-cli KEYS 'vsp:prov:mac:*'` → (empty) |
| Active devices | Expect `0` after full provisioning reset until you re-enroll |

```bash
$COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -c \
  "SELECT slug, name FROM tenants WHERE deleted_at IS NULL ORDER BY slug;"

$COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -c \
  "SELECT COUNT(*) AS active_devices FROM devices WHERE deleted_at IS NULL;"

$COMPOSE exec -T redis redis-cli KEYS 'vsp:prov:mac:*'
```

## Notes

- After `--confirm` provisioning reset, desk phones must be **re-enrolled / re-provisioned** on VSP INTERNAL (or customer tenants).  
- Set `PROV_PUBLIC_BASE_URL=https://prov.vspphone.com` in `.env` for production provision URLs.  
- Reports are written under `static/runtime-verification/preprod-cleanup-*.json`.
