#!/usr/bin/env bash
# Source on EC2:  source scripts/platform/ec2-compose-env.sh
# Canonical DB: compose service `postgres` / database `vsp_phone_v4`
# (see docs/13-production-validation/10-extension-first-ec2-deploy.md).
# Legacy overlay (docker-compose.ec2-legacy-db.yml → vsp_voip) is OPT-IN only.
REPO_ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
cd "$REPO_ROOT"
export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"
if [[ "${VSP_USE_LEGACY_POSTGRES:-0}" == "1" ]]; then
  COMPOSE="$COMPOSE -f docker-compose.ec2-legacy-db.yml"
fi
export COMPOSE
export API_DOCKER_TARGET="${API_DOCKER_TARGET:-production}"
export ADMIN_DOCKER_TARGET="${ADMIN_DOCKER_TARGET:-production}"
