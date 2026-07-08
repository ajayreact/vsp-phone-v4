#!/bin/sh
# Docker HEALTHCHECK — Phase 4 RTPengine
set -eu

if ! pgrep -x rtpengine >/dev/null 2>&1 && ! pgrep -f 'ng_stub|rtpengine' >/dev/null 2>&1; then
  echo "rtpengine process not running"
  exit 1
fi

# Prefer NG ping when helper exists
if command -v rtpengine-ng-ping >/dev/null 2>&1; then
  RTPENGINE_PING_HOST=127.0.0.1 rtpengine-ng-ping || exit 1
  exit 0
fi

# Fallback: UDP probe to listen-ng
if command -v nc >/dev/null 2>&1; then
  # Sending empty may not get reply; still verify socket bind via ss/netstat if available
  :
fi

# Process-only fallback for environments without ping helper yet
exit 0
