#!/usr/bin/env bash
# Extension-First production deploy — run ON EC2 at /opt/vsp-phone-v4
# Preserves .env. Rebuilds api + admin only. Runs Prisma migrate deploy.
#
# Usage (after syncing code tarball or git checkout):
#   sudo bash scripts/platform/ec2-deploy-extension-first.sh
#
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
cd "$REPO_ROOT"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"
if [[ -f docker-compose.ec2-legacy-db.yml ]]; then
  COMPOSE="$COMPOSE -f docker-compose.ec2-legacy-db.yml"
fi
export API_DOCKER_TARGET=production
export ADMIN_DOCKER_TARGET=production

LOG_DIR="${REPO_ROOT}/static/runtime-verification"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/deployment-$(date -u +%Y%m%dT%H%M%SZ).log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== VSP Phone Extension-First Deploy ==="
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Host: $(hostname)"
echo "Repo: $REPO_ROOT"

if [[ ! -f .env ]]; then
  echo "ERROR: .env missing — refusing to deploy"
  exit 1
fi
echo "OK: .env preserved (not modified by this script)"

COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
echo "Git HEAD: $(git log -1 --oneline 2>/dev/null || echo 'no git')"
echo "Commit hash: $COMMIT"
echo "$COMMIT" > "$LOG_DIR/deployed-commit.txt"

echo "=== Rebuild api + admin (production targets) ==="
$COMPOSE build --no-cache api admin

echo "=== Ensure Redis is up ==="
$COMPOSE up -d redis
for i in $(seq 1 24); do
  if $COMPOSE ps redis 2>/dev/null | grep -q '(healthy)'; then
    echo "Redis healthy after ${i} attempts"
    break
  fi
  sleep 2
  if [[ $i -eq 24 ]]; then
    echo "ERROR: Redis failed to become healthy"
    $COMPOSE ps redis
    $COMPOSE logs --tail=40 redis
    exit 1
  fi
done

echo "=== Restart api + admin only ==="
$COMPOSE up -d --force-recreate --no-deps api admin

echo "=== Wait for API healthy ==="
for i in $(seq 1 40); do
  if curl -sk https://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"status":"ok"'; then
    echo "API healthy after ${i} attempts"
    break
  fi
  sleep 5
  if [[ $i -eq 40 ]]; then
    echo "ERROR: API health timeout"
    $COMPOSE logs --tail=80 api
    exit 1
  fi
done

echo "=== DATABASE_URL ==="
docker inspect vsp-api --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^DATABASE_URL=' || true

echo "=== Prisma migrate deploy ==="
$COMPOSE exec -T api npx prisma migrate deploy --schema=/app/prisma/schema.prisma || true

RBAC_SQL="${REPO_ROOT}/prisma/migrations/20260712150000_tenant_dids_write_permission/migration.sql"
if [[ -f "$RBAC_SQL" ]]; then
  echo "=== RBAC backfill: tenant:dids:write (migration SQL) ==="
  DB_HOST="$(grep -E '^DATABASE_HOST=' .env | cut -d= -f2- | tr -d '\r')"
  DB_NAME="$(grep -E '^POSTGRES_APP_DB=' .env | cut -d= -f2- | tr -d '\r')"
  DB_USER="$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2- | tr -d '\r')"
  DB_PASS="$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')"
  DB_HOST="${DB_HOST:-vsp-voip-postgres-1}"
  DB_NAME="${DB_NAME:-vsp_voip}"
  DB_USER="${DB_USER:-vsp}"
  DB_PASS="${DB_PASS:-vsp}"
  docker run --rm -i --network vsp-voip_default postgres:16-alpine \
    psql "postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/${DB_NAME}" < "$RBAC_SQL" || true
fi

echo "=== RBAC verify (tenant:dids:write) ==="
DB_HOST="$(grep -E '^DATABASE_HOST=' .env | cut -d= -f2- | tr -d '\r')"
DB_NAME="$(grep -E '^POSTGRES_APP_DB=' .env | cut -d= -f2- | tr -d '\r')"
DB_USER="$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2- | tr -d '\r')"
DB_PASS="$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')"
DB_HOST="${DB_HOST:-vsp-voip-postgres-1}"
DB_NAME="${DB_NAME:-vsp_voip}"
DB_USER="${DB_USER:-vsp}"
DB_PASS="${DB_PASS:-vsp}"
docker run --rm --network vsp-voip_default postgres:16-alpine \
  psql "postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/${DB_NAME}" -c \
  "SELECT COUNT(*) AS permissions_tenant_dids_write FROM permissions WHERE key = 'tenant:dids:write' AND deleted_at IS NULL;
   SELECT COUNT(*) AS tenant_admin_assignments FROM role_permissions rp
   JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
   JOIN roles r ON r.id = rp.role_id AND r.deleted_at IS NULL
   WHERE p.key = 'tenant:dids:write' AND r.name = 'Tenant Admin' AND rp.deleted_at IS NULL;" || true

echo "=== Container status ==="
$COMPOSE ps api admin

echo "=== Post-deploy health ==="
curl -sk https://127.0.0.1:3000/api/health | tee "$LOG_DIR/post-health.json"
echo ""
curl -sk https://127.0.0.1:3000/api/ready | tee "$LOG_DIR/post-ready.json"
echo ""

echo "=== Hub routes (require tenant JWT — smoke 401/403 expected without token) ==="
curl -sk -o /dev/null -w "hub:%{http_code}\n" https://127.0.0.1:3000/api/v1/tenant/extensions/hub
curl -sk -o /dev/null -w "hub/stats:%{http_code}\n" https://127.0.0.1:3000/api/v1/tenant/extensions/hub/stats

echo "=== Deploy complete ==="
echo "Log: $LOG_FILE"
echo "Commit: $COMMIT"
