# Extension-First EC2 Deployment Runbook

**Target:** `ubuntu@32.196.41.160` → `/opt/vsp-phone-v4`  
**Production database:** `vsp_voip` on `vsp-voip-postgres-1`  
**Branch:** `release/v4.0.0-rc1`  
**Preserve:** existing `.env` (never overwrite)

---

## Production connection (confirmed)

| Field | Value |
|-------|-------|
| Host | `vsp-voip-postgres-1` |
| Port | `5432` |
| User | `vsp` |
| Password | `vsp` |
| Database | **`vsp_voip`** |
| Network | `vsp-voip_default` |
| `DATABASE_URL` | `postgresql://vsp:vsp@vsp-voip-postgres-1:5432/vsp_voip?schema=public` |

Required `.env` keys:

```bash
DATABASE_HOST=vsp-voip-postgres-1
POSTGRES_APP_DB=vsp_voip
POSTGRES_USER=vsp
POSTGRES_PASSWORD=vsp
```

Verify from running API:

```bash
docker inspect vsp-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL='
```

---

## Compose command (use on every step)

```bash
cd /opt/vsp-phone-v4

export COMPOSE="docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.host-db.yml \
  -f docker-compose.ec2-legacy-db.yml \
  --env-file .env"

export API_DOCKER_TARGET=production
export ADMIN_DOCKER_TARGET=production
```

`docker-compose.ec2-legacy-db.yml` joins API to legacy Postgres network. Create once on EC2 if missing:

```bash
cat > /opt/vsp-phone-v4/docker-compose.ec2-legacy-db.yml <<'EOF'
services:
  api:
    networks:
      - vsp_internal
      - legacy_postgres
networks:
  legacy_postgres:
    external: true
    name: vsp-voip_default
EOF
```

---

## Step 1 — Deploy api + admin

```bash
cd /opt/vsp-phone-v4
sudo bash scripts/platform/ec2-deploy-extension-first.sh
```

Or manually:

```bash
$COMPOSE build --no-cache api admin
$COMPOSE up -d redis
$COMPOSE up -d --force-recreate --no-deps api admin
curl -sk https://127.0.0.1:3000/api/health | jq .
```

Always use `--no-deps` when restarting api/admin so empty `vsp-postgres` is not started.

---

## Step 2 — Verify migration status

```bash
docker run --rm --network vsp-voip_default postgres:16-alpine \
  psql "postgresql://vsp:vsp@vsp-voip-postgres-1:5432/vsp_voip" -c \
  "SELECT migration_name, finished_at, rolled_back_at
   FROM _prisma_migrations
   WHERE migration_name = '20260712150000_tenant_dids_write_permission';"
```

| Result | Status |
|--------|--------|
| 0 rows | **Pending** |
| row with `finished_at` set | **Applied** |
| row with `rolled_back_at` set | **Failed** |

This migration is RBAC-only SQL. It may not exist in repo at commit `dc661da`; apply SQL in Step 4 if pending.

List all migrations:

```bash
docker run --rm --network vsp-voip_default postgres:16-alpine \
  psql "postgresql://vsp:vsp@vsp-voip-postgres-1:5432/vsp_voip" -c \
  "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;"
```

---

## Step 3 — Verify RBAC on vsp_voip

```bash
docker run --rm --network vsp-voip_default postgres:16-alpine \
  psql "postgresql://vsp:vsp@vsp-voip-postgres-1:5432/vsp_voip" -c "
SELECT COUNT(*) AS permissions_tenant_dids_write
FROM permissions
WHERE key = 'tenant:dids:write' AND deleted_at IS NULL;

SELECT COUNT(*) AS tenant_admin_assignments
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
JOIN roles r ON r.id = rp.role_id AND r.deleted_at IS NULL
WHERE p.key = 'tenant:dids:write'
  AND r.name = 'Tenant Admin'
  AND rp.deleted_at IS NULL;

SELECT COUNT(*) AS active_tenants FROM tenants WHERE deleted_at IS NULL;
"
```

Expected after fix: `permissions_tenant_dids_write >= 1`, `tenant_admin_assignments >= 1`, `active_tenants >= 1`.

---

## Step 4 — RBAC backfill (if counts are 0)

```bash
docker run --rm -i --network vsp-voip_default postgres:16-alpine \
  psql "postgresql://vsp:vsp@vsp-voip-postgres-1:5432/vsp_voip" <<'SQL'
BEGIN;

INSERT INTO permissions (id, public_id, tenant_id, key, description, version, created_at, updated_at)
SELECT gen_random_uuid(),
       'perm_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
       t.id,
       'tenant:dids:write',
       'tenant:dids:write',
       1,
       NOW(),
       NOW()
FROM tenants t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM permissions p
    WHERE p.tenant_id = t.id
      AND p.key = 'tenant:dids:write'
      AND p.deleted_at IS NULL
  );

INSERT INTO role_permissions (id, tenant_id, role_id, permission_id, created_at, updated_at)
SELECT gen_random_uuid(),
       r.tenant_id,
       r.id,
       p.id,
       NOW(),
       NOW()
FROM roles r
JOIN permissions p
  ON p.tenant_id = r.tenant_id
 AND p.key = 'tenant:dids:write'
 AND p.deleted_at IS NULL
WHERE r.name = 'Tenant Admin'
  AND r.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission_id = p.id
      AND rp.deleted_at IS NULL
  );

COMMIT;
SQL
```

Re-run Step 3 verify queries.

---

## Step 5 — Ensure API uses vsp_voip

```bash
grep -E '^DATABASE_HOST=|^POSTGRES_APP_DB=' /opt/vsp-phone-v4/.env

# Must show:
# DATABASE_HOST=vsp-voip-postgres-1
# POSTGRES_APP_DB=vsp_voip

$COMPOSE up -d --force-recreate --no-deps api
docker inspect vsp-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep DATABASE_URL
curl -sk https://127.0.0.1:3000/api/health | jq .
```

---

## Step 6 — Verify DID assign API

Login and assign (use real email, password, UUIDs from hub):

```bash
export API="https://127.0.0.1:3000/api"

export TENANT_JWT="$(curl -sk -X POST "$API/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"secret"}' | jq -r '.accessToken')"

curl -sk -X POST "$API/v1/tenant/dids/PHONE_NUMBER_UUID/assign" \
  -H "Authorization: Bearer $TENANT_JWT" \
  -H 'Content-Type: application/json' \
  -d '{"destinationType":"EXTENSION","destinationId":"EXTENSION_UUID","callerIdName":"Reception"}' \
  -w "\nHTTP %{http_code}\n"
```

Expected: **HTTP 200**. HTTP 403 = RBAC still missing or stale JWT (log out/in).

Endpoint requires **`tenant:dids:write` only** (`TenantDidsController` + `PermissionsGuard`).

Frontend posts to **`POST /v1/tenant/dids/:id/assign`** via `tenant.repository.assignDid()` — not a platform admin route.

---

## Step 7 — UI smoke test

1. Log out and log in at https://tenant.vspphone.com  
2. `/extensions` → Configure → Phone Number → Assign Number  
3. Refresh — DID persists, no "Insufficient permissions"

---

## Scripts in this repository (commit dc661da)

| Script | Status |
|--------|--------|
| `scripts/platform/ec2-deploy-extension-first.sh` | Committed |
| `scripts/platform/ec2-deploy-onboarding.sh` | Committed |
| `scripts/platform/ec2-deploy-and-verify.sh` | Committed |
| `scripts/platform/ec2-compose-env.sh` | **Not committed** |
| `scripts/platform/ec2-print-database-url.sh` | **Not committed** |
| `scripts/platform/ec2-probe-tenant-databases.cjs` | **Not committed** |

Use the inline commands in this runbook until those helpers are merged.

---

## Rollback

```bash
cd /opt/vsp-phone-v4
git fetch origin
git reset --hard origin/release/v4.0.0-rc1
cp /tmp/vsp-env-backup-* .env
$COMPOSE build api admin
$COMPOSE up -d --force-recreate --no-deps api admin
```
