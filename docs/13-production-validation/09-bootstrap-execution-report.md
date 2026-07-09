# 09 — Super Admin Bootstrap Execution Report

| Field | Value |
|-------|-------|
| **Date** | 2026-07-09 |
| **Branch** | `release/v4.0.0-rc1` |
| **Blocker resolved** | 401 on protected endpoints — no Prisma Super Admin user |

---

## Investigation

| Item | Finding |
|------|---------|
| Prisma seed | **None** |
| Migration seed | **None** |
| Startup bootstrap | **None** (Kamailio DB only) |
| CLI command | **Created:** `npm run platform:bootstrap` |
| Dev auth | `DEV_AUTH_*` — **not for production** |
| Super Admin gate | `SuperAdminGuard` → DB permission `platform:super_admin` |

Login path: `AuthService.login()` → Prisma `User` with scrypt hash → JWT (`sub`, `tenantId`, `email`).

**JWT does not embed permissions.** `platform:super_admin` is verified via `UserRole` → `RolePermission` → `Permission.key` at request time. Use `npm run platform:verify-jwt` after login.

---

## Files changed

| File | Change |
|------|--------|
| `scripts/platform/bootstrap-super-admin.cjs` | Official transactional bootstrap |
| `scripts/platform/password.util.cjs` | scrypt hash (matches AuthService) |
| `scripts/platform/prisma-client.cjs` | Prisma 7 + pg adapter |
| `scripts/platform/verify-super-admin.cjs` | JWT + permission verification |
| `package.json` | `platform:bootstrap`, `superadmin:create`, `platform:verify-jwt` |
| `infrastructure/docker/Dockerfile.api` | COPY `scripts/platform` into production image |
| `docs/13-production-validation/08-platform-bootstrap.md` | Operator runbook |

---

## EC2 execution steps

```bash
cd /opt/vsp-phone-v4
git fetch origin && git reset --hard origin/release/v4.0.0-rc1

export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"
export API="https://127.0.0.1:3000/api"

# 1. Rebuild API image (includes bootstrap scripts)
$COMPOSE build api && $COMPOSE up -d api

# 2. Bootstrap Super Admin (interactive — no hardcoded creds)
$COMPOSE exec -it api node scripts/platform/bootstrap-super-admin.cjs

# 3. Login
curl -sk -X POST "$API/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' | jq .

export JWT=$(curl -sk -X POST "$API/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' | jq -r '.accessToken')

# 4. Verify permission (not in JWT payload — DB RBAC)
$COMPOSE exec -T api node scripts/platform/verify-super-admin.cjs --token="$JWT"

# 5. Smoke test
curl -sk -X POST -H "Authorization: Bearer $JWT" "$API/v1/cutover/smoke-test" | jq .
```

---

## Expected test results

| Test | Auth | Expected |
|------|------|----------|
| `POST /v1/auth/login` | None | 200 + `accessToken` |
| `GET /v1/cutover/readiness` | Bearer JWT | 200 |
| `POST /v1/cutover/smoke-test` | Bearer JWT | 200, tests array |
| `GET /v1/migration/validate` | Bearer JWT | 200 |
| `GET /v1/ha/readiness` | `X-VSP-Service-Auth` | 200 |
| `GET /v1/production/readiness` | `X-VSP-Service-Auth` | 200 |

---

## SQL verification (optional)

```bash
$COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -c \
  "SELECT t.slug, u.email, p.key FROM tenants t
   JOIN users u ON u.tenant_id = t.id AND u.deleted_at IS NULL
   JOIN user_roles ur ON ur.user_id = u.id AND ur.deleted_at IS NULL
   JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
   JOIN role_permissions rp ON rp.role_id = r.id AND rp.deleted_at IS NULL
   JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
   WHERE t.slug = 'platform';"
```

Expected row: `platform | your@email | platform:super_admin`

---

## Production readiness (post-bootstrap)

| Gate | Status |
|------|--------|
| Infrastructure healthy | ✅ (pre-bootstrap) |
| Super Admin bootstrap command | ✅ Implemented |
| Bootstrap executed on EC2 | ☐ Operator action |
| Login + JWT | ☐ After bootstrap |
| Cutover smoke-test 200 | ☐ After bootstrap |
| `MIGRATION_DEV_SUPER_ADMIN=false` | ☐ Confirm in `.env` |

**Verdict after EC2 bootstrap:** Platform ready for Super Admin cutover/migration operations.
