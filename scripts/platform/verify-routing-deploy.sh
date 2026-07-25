#!/usr/bin/env bash
# Verify the running API container actually contains the caller-lookup fix
# (commit b22ec29+) before trusting any CALLER_LINE_NOT_FOUND diagnosis.
#
# Usage (on EC2):
#   cd /opt/vsp-phone-v4 && source scripts/platform/ec2-compose-env.sh
#   bash scripts/platform/verify-routing-deploy.sh

set -euo pipefail

echo "=== 1) Host repo commit ==="
git log -1 --oneline
git status --short

echo
echo "=== 2) Running api container image build info ==="
docker inspect vsp-api --format 'Image={{.Image}} Created={{.Created}}' 2>/dev/null || echo "vsp-api not found"

echo
echo "=== 3) Does the compiled bundle inside the container contain the fix? ==="
echo "--- assignment lookup marker ---"
docker exec vsp-api sh -c "grep -rl 'telecom.route.lookup.assignment' /app 2>/dev/null || grep -rl 'telecom.route.lookup.assignment' /usr/src/app 2>/dev/null || true" | head -5

echo "--- dto_in raw-DTO marker ---"
docker exec vsp-api sh -c "grep -rl 'telecom.route.resolve.dto_in' /app 2>/dev/null || grep -rl 'telecom.route.resolve.dto_in' /usr/src/app 2>/dev/null || true" | head -5

echo "--- endpoint_without_line marker ---"
docker exec vsp-api sh -c "grep -rl 'endpoint_without_line' /app 2>/dev/null || grep -rl 'endpoint_without_line' /usr/src/app 2>/dev/null || true" | head -5

echo
echo "=== 4) If markers are MISSING, rebuild+restart api only ==="
echo "  \$COMPOSE build api && \$COMPOSE up -d --no-deps api"
echo
echo "=== 5) Tail live routing diagnostics (dial now) ==="
echo "  \$COMPOSE logs -f --since 0s api | grep -E 'telecom.route.resolve.dto_in|telecom.route.lookup|telecom.route.caller_lookup|telecom.route.reject'"
