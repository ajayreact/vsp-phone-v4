#!/bin/sh
# RC3 RTPengine healthcheck — rejects stub backend when production required
set -eu

REQUIRE="${RTPENGINE_REQUIRE_DAEMON:-0}"
BACKEND="unknown"
if [ -f /etc/rtpengine/.backend ]; then
  BACKEND=$(cat /etc/rtpengine/.backend)
fi

if [ "${REQUIRE}" = "1" ] || [ "${REQUIRE}" = "true" ]; then
  if [ "${BACKEND}" != "real" ]; then
    echo "rtpengine stub backend not allowed in production (backend=${BACKEND})"
    exit 1
  fi
fi

if ! pgrep -x rtpengine >/dev/null 2>&1 && ! pgrep -f 'ng_stub|rtpengine' >/dev/null 2>&1; then
  echo "rtpengine process not running"
  exit 1
fi

if command -v rtpengine-ng-ping >/dev/null 2>&1; then
  RTPENGINE_PING_HOST=127.0.0.1 rtpengine-ng-ping || exit 1
fi

exit 0
