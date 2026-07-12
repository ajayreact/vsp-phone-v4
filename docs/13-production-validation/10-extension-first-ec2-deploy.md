# 10 — Extension-First EC2 Deploy & RBAC

| Field | Value |
|-------|-------|
| **Branch** | `release/v4.0.0-rc1` |
| **Production DB host** | `postgres` (container `vsp-postgres`) |
| **Production DB name** | `vsp_phone_v4` |
| **Legacy** | `vsp-voip-postgres-1` / `vsp_voip` — v3 only, not for v4 API |

---

## Required `.env` (EC2)

```bash
DATABASE_HOST=postgres
POSTGRES_APP_DB=vsp_phone_v4
POSTGRES_USER=vsp
POSTGRES_PASSWORD=vsp
```

Resulting API connection:

```text
postgresql://vsp:vsp@postgres:5432/vsp_phone_v4?schema=public
```

Verify:

```bash
docker inspect vsp-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL='
docker exec vsp-postgres psql -U vsp -d vsp_phone_v4 -c \
  "SELECT COUNT(*) AS tenants FROM tenants WHERE deleted_at IS NULL;"
```

Do **not** use `DATABASE_HOST=vsp-voip-postgres-1` — that host's `vsp_phone_v4` is empty.  
Do **not** use `POSTGRES_APP_DB=vsp_voip` — legacy v3 schema.

---

## Compose (EC2)

```bash
cd /opt/vsp-phone-v4

export COMPOSE="docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.host-db.yml \
  --env-file .env"

export API_DOCKER_TARGET=production
export ADMIN_DOCKER_TARGET=production
```

`docker-compose.ec2-legacy-db.yml` is only needed when connecting to `vsp-voip-postgres-1`.  
When using compose `postgres` (`vsp-postgres`), omit the legacy overlay.

---

## Deploy

```bash
$COMPOSE up -d postgres redis
$COMPOSE up -d --force-recreate --no-deps api admin
curl -sk https://127.0.0.1:3000/api/health | jq .
```

---

## RBAC: `tenant:dids:write`

After git pull (`bcc68a3+`):

```bash
$COMPOSE exec -T api npx prisma migrate deploy --schema=/app/prisma/schema.prisma

docker exec -i vsp-postgres psql -U vsp -d vsp_phone_v4 \
  < prisma/migrations/20260712150000_tenant_dids_write_permission/migration.sql
```

Verify:

```bash
docker exec vsp-postgres psql -U vsp -d vsp_phone_v4 -c \
  "SELECT COUNT(*) AS permissions FROM permissions WHERE key='tenant:dids:write' AND deleted_at IS NULL;
   SELECT COUNT(*) AS role_links FROM role_permissions rp
   JOIN permissions p ON p.id=rp.permission_id JOIN roles r ON r.id=rp.role_id
   WHERE p.key='tenant:dids:write' AND r.name='Tenant Admin' AND rp.deleted_at IS NULL;"
```

Both counts must be **≥ 1**. Log out/in at https://tenant.vspphone.com, then test Assign DID.

---

## Runtime checklist

| Check | Expected |
|-------|----------|
| `/extensions` landing | Works |
| Assign DID | HTTP 200, no 403 |
| DID persists after refresh | Yes |
| QR / rename / provision | Unchanged |
