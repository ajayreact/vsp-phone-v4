#!/bin/sh
# RC3 RTPengine entrypoint — real daemon for production media + recording spool
set -eu

CONF="${RTPENGINE_CONF:-/etc/rtpengine/rtpengine.conf}"
RUNTIME_CONF="${RTPENGINE_RUNTIME_CONF:-/run/rtpengine/rtpengine.conf}"
SPOOL="${RTPENGINE_RECORDING_DIR:-/var/spool/rtpengine}"
LOGDIR="${RTPENGINE_LOG_DIR:-/var/log/rtpengine}"
BACKEND_FILE=/etc/rtpengine/.backend
REQUIRE="${RTPENGINE_REQUIRE_DAEMON:-0}"

mkdir -p "${SPOOL}" "${LOGDIR}" /etc/rtpengine /run/rtpengine
chmod 755 "${SPOOL}" "${LOGDIR}" || true

if [ ! -f "${CONF}" ]; then
  echo "[rtpengine] ERROR: missing config ${CONF}"
  exit 1
fi

BACKEND="unknown"
if [ -f "${BACKEND_FILE}" ]; then
  BACKEND=$(cat "${BACKEND_FILE}")
fi

if [ "${REQUIRE}" = "1" ] || [ "${REQUIRE}" = "true" ]; then
  if [ "${BACKEND}" != "real" ]; then
    echo "[rtpengine] FATAL: RTPENGINE_REQUIRE_DAEMON=1 but backend=${BACKEND}"
    exit 1
  fi
fi

cp "${CONF}" "${RUNTIME_CONF}"

if [ -n "${RTPENGINE_ADVERTISE:-}" ]; then
  sed -i "s|^interface = .*|interface = internal/eth0!${RTPENGINE_ADVERTISE}|" "${RUNTIME_CONF}"
  echo "[rtpengine] advertised public address ${RTPENGINE_ADVERTISE}"
elif [ "${REQUIRE}" = "1" ] || [ "${REQUIRE}" = "true" ]; then
  echo "[rtpengine] WARNING: RTPENGINE_ADVERTISE unset — desk SDP c= may use private IP (0 RTP from NAT phones)"
fi

if [ -n "${RTPENGINE_LOG_LEVEL:-}" ]; then
  sed -i "s|^log-level = .*|log-level = ${RTPENGINE_LOG_LEVEL}|" "${RUNTIME_CONF}"
fi

echo "[rtpengine] rc3 starting backend=${BACKEND} conf=${RUNTIME_CONF}"
echo "[rtpengine] ICE/DTLS-SRTP negotiated via Kamailio offer/answer flags"
echo "[rtpengine] recording spool=${SPOOL} method=proc"

for key in listen-ng interface port-min port-max recording-dir; do
  if ! grep -Eq "^[[:space:]]*${key}[[:space:]]*=" "${RUNTIME_CONF}"; then
    echo "[rtpengine] ERROR: missing required key: ${key}"
    exit 1
  fi
done

if ! command -v rtpengine >/dev/null 2>&1; then
  echo "[rtpengine] FATAL: rtpengine binary missing"
  exit 1
fi

if [ "${BACKEND}" = "real" ]; then
  if rtpengine --help 2>&1 | grep -q -- '--config-file'; then
    echo "[rtpengine] exec rtpengine-daemon --config-file"
    exec rtpengine --config-file="${RUNTIME_CONF}"
  fi
  echo "[rtpengine] exec rtpengine-daemon (default flags)"
  exec rtpengine -f --config-file="${RUNTIME_CONF}"
fi

echo "[rtpengine] exec lab stub (set RTPENGINE_REQUIRE_DAEMON=1 for production)"
exec rtpengine
