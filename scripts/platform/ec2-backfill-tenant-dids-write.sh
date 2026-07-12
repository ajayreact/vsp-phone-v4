#!/usr/bin/env bash
# Apply tenant:dids:write RBAC on production (auto-uses DATABASE_URL from api compose env).
set -euo pipefail
REPO_ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
cd "$REPO_ROOT"
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/platform/ec2-compose-env.sh"

echo "=== DATABASE_URL (from running api or compose config) ==="
bash "${REPO_ROOT}/scripts/platform/ec2-print-database-url.sh" | sed 's/:\([^:@]*\)@/:***@/'

echo "=== RBAC backfill tenant:dids:write ==="
$COMPOSE run --rm --no-deps api node scripts/platform/ec2-tenant-dids-write-backfill.cjs

echo "=== Verify ==="
$COMPOSE run --rm --no-deps api node scripts/platform/ec2-verify-tenant-dids-write.cjs
