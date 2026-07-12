#!/usr/bin/env bash
# Print DATABASE_URL from the running vsp-api container (authoritative for production SQL).
set -euo pipefail
REPO_ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
cd "$REPO_ROOT"

if docker inspect vsp-api >/dev/null 2>&1; then
  docker inspect vsp-api --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep '^DATABASE_URL=' \
    | cut -d= -f2- \
    | head -1
  exit 0
fi

# Fallback: rendered compose config (api not running)
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/platform/ec2-compose-env.sh"
$COMPOSE config 2>/dev/null \
  | awk '/DATABASE_URL:/{gsub(/'\''/,""); print $2; exit}'
