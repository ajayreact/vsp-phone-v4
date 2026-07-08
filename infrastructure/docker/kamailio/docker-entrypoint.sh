#!/bin/sh
# Kamailio entrypoint — TLS gates, service auth injection, usrloc persistence, cfg lint
set -eu

CFG="${KAMAILIO_CFG:-/etc/kamailio/kamailio.cfg}"
TLS_KEY="${KAMAILIO_TLS_KEY:-/etc/kamailio/tls/privkey.pem}"
TLS_CERT="${KAMAILIO_TLS_CERT:-/etc/kamailio/tls/fullchain.pem}"
DISPATCHER="${KAMAILIO_DISPATCHER_LIST:-/etc/kamailio/dispatcher.list}"
PERM_ADDR="${KAMAILIO_PERMISSIONS_FILE:-/etc/kamailio/permissions.address}"
REQUIRE_TLS="${KAMAILIO_REQUIRE_TLS:-true}"
REQUIRE_SERVICE_AUTH="${KAMAILIO_REQUIRE_SERVICE_AUTH:-false}"
AUTH_TOKEN="${TELECOM_SERVICE_AUTH_TOKEN:-}"
USRLOC_MODE="${KAMAILIO_USRLOC_PERSISTENCE:-memory}"
USRLOC_DB_URL="${KAMAILIO_USRLOC_DB_URL:-${DATABASE_URL:-}}"

echo "[kamailio] remediation entrypoint — validating configuration"

if [ ! -f "${DISPATCHER}" ]; then
  echo "[kamailio] ERROR: dispatcher list missing: ${DISPATCHER}"
  exit 1
fi
if [ ! -f "${PERM_ADDR}" ]; then
  echo "[kamailio] ERROR: permissions address file missing: ${PERM_ADDR}"
  exit 1
fi

if [ "${REQUIRE_SERVICE_AUTH}" = "true" ] && [ -z "${AUTH_TOKEN}" ]; then
  echo "[kamailio] ERROR: KAMAILIO_REQUIRE_SERVICE_AUTH=true but TELECOM_SERVICE_AUTH_TOKEN unset"
  exit 1
fi

# Remediation C-01 — inject service auth token (no hard-coded secrets in cfg)
if [ -n "${AUTH_TOKEN}" ]; then
  ESCAPED=$(printf '%s' "${AUTH_TOKEN}" | sed 's/[\\/&|]/\\&/g')
  sed -i "s|__VSP_SERVICE_AUTH_TOKEN__|${ESCAPED}|g" "${CFG}"
  echo "[kamailio] service auth token injected for NestJS HTTP client"
else
  sed -i 's|__VSP_SERVICE_AUTH_TOKEN__||g' "${CFG}"
  echo "[kamailio] WARNING: TELECOM_SERVICE_AUTH_TOKEN unset — NestJS auth header omitted (lab only)"
fi

# Remediation H-06 — usrloc persistence mode
case "${USRLOC_MODE}" in
  postgres)
    if [ -z "${USRLOC_DB_URL}" ]; then
      echo "[kamailio] ERROR: KAMAILIO_USRLOC_PERSISTENCE=postgres requires KAMAILIO_USRLOC_DB_URL or DATABASE_URL"
      exit 1
    fi
    sed -i 's/__USRLOC_DB_MODE__/2/g' "${CFG}"
    ESC_DB=$(printf '%s' "${USRLOC_DB_URL}" | sed 's/[\\/&|]/\\&/g')
    sed -i "s|__USRLOC_DB_URL_LINE__|modparam(\"usrloc\", \"db_url\", \"${ESC_DB}\")|" "${CFG}"
    if ! grep -q 'db_postgres.so' "${CFG}"; then
      sed -i '/loadmodule "usrloc.so"/i loadmodule "db_postgres.so"' "${CFG}"
    fi
    echo "[kamailio] usrloc persistence=postgres (restart-safe registrations)"
    ;;
  *)
    sed -i 's/__USRLOC_DB_MODE__/0/g' "${CFG}"
    sed -i 's|__USRLOC_DB_URL_LINE__|# usrloc db_url disabled (memory mode)|' "${CFG}"
    echo "[kamailio] usrloc persistence=memory"
    ;;
esac

if [ ! -f "${TLS_KEY}" ] || [ ! -f "${TLS_CERT}" ]; then
  echo "[kamailio] TLS material missing at ${TLS_KEY} / ${TLS_CERT}"
  if [ "${REQUIRE_TLS}" = "true" ]; then
    echo "[kamailio] ERROR: KAMAILIO_REQUIRE_TLS=true — refusing start"
    exit 1
  fi
  echo "[kamailio] WARNING: continuing without TLS (lab only)"
else
  echo "[kamailio] TLS material OK"
  chmod 600 "${TLS_KEY}" 2>/dev/null || true
fi

RTP_HOST="${RTPENGINE_HOST:-rtpengine}"
RTP_PORT="${RTPENGINE_NG_PORT:-2223}"
if command -v nc >/dev/null 2>&1; then
  if nc -z -u -w 2 "${RTP_HOST}" "${RTP_PORT}" 2>/dev/null; then
    echo "[kamailio] rtpengine UDP ${RTP_HOST}:${RTP_PORT} appears reachable"
  else
    echo "[kamailio] WARNING: rtpengine ${RTP_HOST}:${RTP_PORT} not reachable yet"
  fi
fi

echo "[kamailio] lint: kamailio -c -f ${CFG}"
if ! kamailio -c -f "${CFG}"; then
  echo "[kamailio] configuration validation FAILED"
  exit 1
fi

echo "[kamailio] configuration OK — exec $*"
exec "$@"
