#!/bin/sh
# Compose / Docker HEALTHCHECK for Kamailio Phase 3
set -eu

if ! pidof kamailio >/dev/null 2>&1 && ! pgrep -x kamailio >/dev/null 2>&1; then
  echo "kamailio process not running"
  exit 1
fi

# HTTP health endpoint (xhttp :8880)
if command -v curl >/dev/null 2>&1; then
  if curl -fsS "http://127.0.0.1:8880/health" | grep -q '"status":"ok"'; then
    exit 0
  fi
  echo "HTTP /health failed"
  exit 1
fi

# Fallback: process only
exit 0
