#!/usr/bin/env bash
# Full EC2 deploy + DB verify for onboarding release.
# Paste on EC2 after syncing latest code into /opt/vsp-phone-v4
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
cd "$REPO_ROOT"

export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"
export API_DOCKER_TARGET=production
export ADMIN_DOCKER_TARGET=production

echo "=== 1. Rebuild api + admin ==="
$COMPOSE build api admin
$COMPOSE up -d --force-recreate api admin

echo "=== 2. Wait for API ==="
for i in $(seq 1 36); do
  if curl -sk https://127.0.0.1:3000/api/health | grep -q '"status":"ok"'; then
    echo "API healthy"
    break
  fi
  sleep 5
done

echo "=== 3. Prisma migrate deploy ==="
$COMPOSE exec -T api npx prisma migrate deploy --schema=/app/prisma/schema.prisma

echo "=== 4. Container status ==="
$COMPOSE ps api admin postgres

echo "=== 5. Run E2E (set PLATFORM_EMAIL + PLATFORM_PASSWORD) ==="
echo "Example:"
echo "  export PLATFORM_EMAIL='your-super-admin@example.com'"
echo "  export PLATFORM_PASSWORD='***'"
echo "  export API_BASE='https://api.vspphone.com/api'"
echo "  node scripts/platform/verify-production-e2e.cjs"
