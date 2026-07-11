#!/usr/bin/env bash
# Deploy latest onboarding + marketplace changes on EC2 and run verification.
# Run ON EC2: sudo bash scripts/platform/ec2-deploy-and-verify.sh
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
cd "$REPO_ROOT"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"
export API_DOCKER_TARGET=production
export ADMIN_DOCKER_TARGET=production

echo "==> Git sync"
git fetch origin
git reset --hard origin/release/v4.0.0-rc1
git log -1 --oneline

echo "==> Rebuild api + admin"
$COMPOSE build --no-cache api admin
$COMPOSE up -d --force-recreate api admin

echo "==> Wait for API healthy"
for i in $(seq 1 30); do
  if curl -sk https://127.0.0.1:3000/api/health | grep -q '"status":"ok"'; then
    echo "API healthy"
    break
  fi
  sleep 5
done

echo "==> Prisma migrate deploy"
$COMPOSE exec -T api npx prisma migrate deploy --schema=/app/prisma/schema.prisma

echo "==> Container status"
$COMPOSE ps api admin

echo "==> Run verification (set PLATFORM_JWT and SUPER_ADMIN_EMAIL/PASSWORD in env)"
node scripts/platform/verify-production-e2e.cjs
