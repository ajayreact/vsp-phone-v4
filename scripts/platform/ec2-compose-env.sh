#!/usr/bin/env bash
# Source on EC2:  source scripts/platform/ec2-compose-env.sh
REPO_ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
cd "$REPO_ROOT"
export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml -f docker-compose.ec2-legacy-db.yml --env-file .env"
export API_DOCKER_TARGET="${API_DOCKER_TARGET:-production}"
export ADMIN_DOCKER_TARGET="${ADMIN_DOCKER_TARGET:-production}"
