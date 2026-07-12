# 10 — Extension-First EC2 Deploy & RBAC

| Field | Value |
|-------|-------|
| **Branch** | `release/v4.0.0-rc1` |
| **Production DB** | `vsp_voip` on `vsp-voip-postgres-1` |
| **Network** | `vsp-voip_default` |

---

## Required `.env` (EC2)

```bash
DATABASE_HOST=vsp-voip-postgres-1
POSTGRES_APP_DB=vsp_voip
POSTGRES_USER=vsp
POSTGRES_PASSWORD=vsp
```

Resulting API connection:

```text
postgresql://vsp:vsp@vsp-voip-postgres-1:5432/vsp_voip?schema=public
```

Verify:

```bash
docker inspect vsp-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL='
```

---

## Compose (EC2)

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

`docker-compose.ec2-legacy-db.yml` connects the API to legacy Postgres (`vsp-voip-postgres-1`).

---

## Deploy

```bash
sudo bash scripts/platform/ec2-deploy-extension-first.sh
```

Manual restart (api + admin only):

```bash
$COMPOSE up -d redis
$COMPOSE up -d --force-recreate --no-deps api admin
curl -sk https://127.0.0.1:3000/api/health | jq .
```

---

## Migration: `20260712150000_tenant_dids_write_permission`

Check status:

```bash
docker run --rm --network vsp-voip_default postgres:16-alpine \
  psql "postgresql://vsp:vsp@vsp-voip-postgres-1:5432/vsp_voip" -c \
  "SELECT migration_name, finished_at FROM _prisma_migrations
   WHERE migration_name = '20260712150000_tenant_dids_write_permission';"
```

Apply via Prisma (preferred after git pull):

```bash
$COMPOSE exec -T api npx prisma migrate deploy --schema=/app/prisma/schema.prisma
```

Or apply SQL directly:

```bash
docker run --rm -i --network vsp-voip_default postgres:16-alpine \
  psql "postgresql://vsp:vsp@vsp-voip-postgres-1:5432/vsp_voip" \
  < prisma/migrations/20260712150000_tenant_dids_write_permission/migration.sql
```

---

## Verify RBAC

```bash
docker run --rm --network vsp-voip_default postgres:16-alpine \
  psql "postgresql://vsp:vsp@vsp-voip-postgres-1:5432/vsp_voip" -c "
SELECT COUNT(*) AS permissions_tenant_dids_write
FROM permissions WHERE key = 'tenant:dids:write' AND deleted_at IS NULL;
SELECT COUNT(*) AS tenant_admin_assignments
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
JOIN roles r ON r.id = rp.role_id AND r.deleted_at IS NULL
WHERE p.key = 'tenant:dids:write' AND r.name = 'Tenant Admin' AND rp.deleted_at IS NULL;"
```

Both counts must be **≥ 1**. Then log out/in at https://tenant.vspphone.com (fresh JWT).

---

## Runtime checklist

| Check | Expected |
|-------|----------|
| Login landing | `/extensions` |
| Configure drawer | Opens |
| Phone Number tab | Opens |
| Assign DID | HTTP 200, no 403 |
| Refresh | DID persists |
| Caller ID | Saved with assign payload |
| Inbound route | Created on assign |
| Extension rename | Works (`tenant:extensions:write`) |
| QR generation | Works |
| Desk / mobile provision | Works (`tenant:devices:write`) |

---

## API permission

`POST /v1/tenant/dids/:id/assign` requires **`tenant:dids:write`** only.

Frontend: `tenant.repository.assignDid()` → `/v1/tenant/dids/${id}/assign`.
