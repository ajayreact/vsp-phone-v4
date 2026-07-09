# 08 — Platform Super Admin Bootstrap

| Field | Value |
|-------|-------|
| **Version** | 4.0.0-rc1 |
| **Purpose** | Official production path for first Super Admin |

---

## Architecture summary

| Layer | Mechanism |
|-------|-----------|
| **Login** | `POST /api/v1/auth/login` → Prisma `User` + scrypt password hash |
| **JWT** | HS256 signed with `JWT_SECRET`; payload: `sub`, `tenantId`, `email` |
| **Super Admin** | `SuperAdminGuard` → `PermissionsService.userHasPermission(sub, platform:super_admin)` |
| **RBAC** | `User` → `UserRole` → `Role` → `RolePermission` → `Permission.key` |

**Important:** JWT does **not** contain `platform:super_admin`. Permissions live in PostgreSQL and are evaluated on each protected request. Verify via `npm run platform:verify-jwt` or a successful call to `/api/v1/cutover/readiness`.

**Not used in production:**

- `DEV_AUTH_*` credentials
- `MIGRATION_DEV_SUPER_ADMIN` bypass (set `false` when `VSP_ENV=production`)

---

## Prerequisites — initialize app database

RC1 ships `prisma/schema.prisma` without a `prisma/migrations/` folder. Before bootstrap, create tables once:

```bash
$COMPOSE up -d api postgres
$COMPOSE exec api npx prisma db push --schema=/app/prisma/schema.prisma
```

Expected: `Your database is now in sync with your Prisma schema.`

Verify:

```bash
$COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -c '\dt' | head -20
```

You should see `tenants`, `users`, `roles`, `permissions`, etc.

---

## Bootstrap command

```bash
npm run platform:bootstrap
# alias:
npm run superadmin:create
```

Prompts for:

- Email
- Password (min 12 chars, hidden)
- Full name

Non-interactive (operators supply secrets at runtime — never commit):

```bash
npm run platform:bootstrap -- \
  --email=ops@example.com \
  --password='YourSecurePassword12!' \
  --name='Platform Operator'
```

### EC2 (Docker)

```bash
cd /opt/vsp-phone-v4
export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"

# Rebuild API image (include scripts in image layer)
$COMPOSE build --no-cache api && $COMPOSE up -d api

# Verify scripts visible inside container
$COMPOSE exec api ls -la /app/scripts/platform/

# Bootstrap Super Admin (interactive — no hardcoded creds)
$COMPOSE exec -it api node scripts/platform/bootstrap-super-admin.cjs

# Or one-shot with env (no secrets in shell history — use read -s)
$COMPOSE exec -T api node scripts/platform/bootstrap-super-admin.cjs \
  --email=ops@example.com \
  --password='***' \
  --name='Platform Operator'
```

### Idempotency

| Entity | Behavior on re-run |
|--------|-------------------|
| Platform tenant (`slug=platform`) | Reused; never duplicated |
| Permission `platform:super_admin` | Reused |
| Role `Super Admin` | Reused |
| User (same email) | **Password updated only** |
| Role/permission mappings | Created if missing |

---

## Login

```bash
export API="https://127.0.0.1:3000/api"

curl -sk -X POST "$API/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ops@example.com","password":"YourSecurePassword12!"}' | jq .

export JWT=$(curl -sk -X POST "$API/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"ops@example.com","password":"YourSecurePassword12!"}' | jq -r '.accessToken')
```

Expected: HTTP 200, `accessToken`, `userId`, `tenantId`, `email`.

---

## Verify JWT + Super Admin permission

```bash
JWT="$JWT" npm run platform:verify-jwt

# Decode payload only (no permission check)
node -e "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url')))" "$JWT"
```

Expected from verify script:

```json
{
  "hasPlatformSuperAdmin": true,
  "permissions": ["platform:super_admin"]
}
```

---

## Protected endpoint tests

### JWT + Super Admin (`cutover`, `migration`)

```bash
curl -sk -H "Authorization: Bearer $JWT" "$API/v1/cutover/readiness" | jq .
curl -sk -X POST -H "Authorization: Bearer $JWT" "$API/v1/cutover/smoke-test" | jq .
curl -sk -H "Authorization: Bearer $JWT" "$API/v1/migration/validate" | jq .
```

Expected: HTTP 200 (not 401/403).

### Service auth (`ha`, `production`) — uses `X-VSP-Service-Auth`, not JWT

```bash
export TOKEN=$(grep '^TELECOM_SERVICE_AUTH_TOKEN=' .env | cut -d= -f2-)

curl -sk -H "X-VSP-Service-Auth: $TOKEN" "$API/v1/ha/readiness" | jq .
curl -sk -H "X-VSP-Service-Auth: $TOKEN" "$API/v1/production/readiness" | jq .
```

---

## Troubleshooting: `Cannot find module ... bootstrap-super-admin.cjs`

The API production image may have been built from cache before bootstrap scripts existed on the host.

**1. Confirm scripts on EC2 host:**

```bash
ls -la /opt/vsp-phone-v4/scripts/platform/bootstrap-super-admin.cjs
git fetch origin && git reset --hard origin/release/v4.0.0-rc1
```

**2. Recreate API with prod volume mount** (`docker-compose.prod.yml` mounts `./scripts/platform` → `/app/scripts/platform`):

```bash
$COMPOSE up -d api
$COMPOSE exec api ls -la /app/scripts/platform/
```

**3. If still missing, one-shot run with explicit mount:**

```bash
$COMPOSE run --rm -it \
  -v "$(pwd)/scripts/platform:/app/scripts/platform:ro" \
  api node scripts/platform/bootstrap-super-admin.cjs
```

**4. Force image rebuild (optional):**

```bash
$COMPOSE build --no-cache api && $COMPOSE up -d api
```

---

```sql
SELECT id, slug, status FROM tenants WHERE slug = 'platform' AND deleted_at IS NULL;
SELECT key FROM permissions p
  JOIN tenants t ON t.id = p.tenant_id
  WHERE t.slug = 'platform' AND p.key = 'platform:super_admin' AND p.deleted_at IS NULL;
SELECT u.email, r.name FROM users u
  JOIN user_roles ur ON ur.user_id = u.id AND ur.deleted_at IS NULL
  JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
  JOIN tenants t ON t.id = u.tenant_id
  WHERE t.slug = 'platform' AND u.deleted_at IS NULL;
```

Bootstrap uses Prisma transactions — no manual SQL required.

---

## Production checklist

- [ ] `MIGRATION_DEV_SUPER_ADMIN=false` in `.env`
- [ ] `JWT_SECRET` set (not `DEV_JWT_SECRET`)
- [ ] `npm run platform:bootstrap` executed once
- [ ] Login returns JWT
- [ ] `platform:verify-jwt` → `hasPlatformSuperAdmin: true`
- [ ] `POST /api/v1/cutover/smoke-test` → HTTP 200
