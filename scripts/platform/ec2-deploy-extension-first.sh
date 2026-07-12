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

echo "=== Prisma migrate deploy ==="
$COMPOSE exec -T api npx prisma migrate deploy --schema=/app/prisma/schema.prisma

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
