#!/bin/sh
# Phase 4 RTPengine entrypoint — validate dirs, log config, start daemon/stub
set -eu

CONF="${RTPENGINE_CONF:-/etc/rtpengine/rtpengine.conf}"
SPOOL="${RTPENGINE_RECORDING_DIR:-/var/spool/rtpengine}"
LOGDIR="${RTPENGINE_LOG_DIR:-/var/log/rtpengine}"
BACKEND_FILE=/etc/rtpengine/.backend

mkdir -p "${SPOOL}" "${LOGDIR}" /etc/rtpengine
chmod 755 "${SPOOL}" "${LOGDIR}" || true

echo "[rtpengine] phase=4 starting"
echo "[rtpengine] conf=${CONF}"

if [ ! -f "${CONF}" ]; then
  echo "[rtpengine] ERROR: missing config ${CONF}"
  exit 1
fi

# Ensure key Phase-4 settings exist
for key in listen-ng interface port-min port-max recording-dir; do
  if ! grep -Eq "^[[:space:]]*${key}[[:space:]]*=" "${CONF}"; then
    echo "[rtpengine] ERROR: ${CONF} missing required key: ${key}"
    exit 1
  fi
done

BACKEND="unknown"
if [ -f "${BACKEND_FILE}" ]; then
  BACKEND=$(cat "${BACKEND_FILE}")
fi
echo "[rtpengine] backend=${BACKEND}"
echo "[rtpengine] recording spool prepared at ${SPOOL} (pipeline deferred)"
echo "[rtpengine] ICE/DTLS/SRTP: capability ready when real daemon present; stub answers NG only"

# Optional advertised address for future (documented)
if [ -n "${RTPENGINE_ADVERTISE:-}" ]; then
  echo "[rtpengine] RTPENGINE_ADVERTISE=${RTPENGINE_ADVERTISE} (apply via interface config / future template)"
fi

if ! command -v rtpengine >/dev/null 2>&1; then
  echo "[rtpengine] FATAL: rtpengine binary missing"
  exit 1
fi

# Real daemon: prefer --config-file when supported
if [ "${BACKEND}" = "real" ] || rtpengine --help 2>&1 | grep -q -- '--config-file'; then
  if rtpengine --help 2>&1 | grep -q -- '--config-file'; then
    echo "[rtpengine] exec real daemon with --config-file"
    exec rtpengine --config-file="${CONF}"
  fi
fi

echo "[rtpengine] exec ${BACKEND} rtpengine"
exec rtpengine
