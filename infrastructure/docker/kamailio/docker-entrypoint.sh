#!/bin/sh
# Kamailio entrypoint — TLS gates, service auth injection, usrloc persistence, cfg lint
set -eu

CFG="${KAMAILIO_CFG:-/etc/kamailio/kamailio.cfg}"
# Compose mounts kamailio.cfg read-only; copy to a writable runtime file before sed.
RUNTIME_CFG="/tmp/kamailio.runtime.cfg"
cp "${CFG}" "${RUNTIME_CFG}"
CFG="${RUNTIME_CFG}"
TLS_KEY="${KAMAILIO_TLS_KEY:-/etc/kamailio/tls/privkey.pem}"
TLS_CERT="${KAMAILIO_TLS_CERT:-/etc/kamailio/tls/fullchain.pem}"
DISPATCHER="${KAMAILIO_DISPATCHER_LIST:-/etc/kamailio/dispatcher.list}"
PERM_ADDR="${KAMAILIO_PERMISSIONS_FILE:-/etc/kamailio/permissions.address}"
REQUIRE_TLS="${KAMAILIO_REQUIRE_TLS:-true}"
REQUIRE_SERVICE_AUTH="${KAMAILIO_REQUIRE_SERVICE_AUTH:-false}"
AUTH_TOKEN="${TELECOM_SERVICE_AUTH_TOKEN:-}"
USRLOC_MODE="${KAMAILIO_USRLOC_PERSISTENCE:-memory}"
USRLOC_DB_URL="${KAMAILIO_USRLOC_DB_URL:-${DATABASE_URL:-}}"
# Kamailio usrloc binds db_postgres for postgres:// URLs; postgresql:// maps to missing db_postgresql.
USRLOC_DB_URL=$(printf '%s' "${USRLOC_DB_URL}" | sed 's|^postgresql://|postgres://|')

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

# ADR-045 — carrier leg is bridged by the Asterisk B2BUA core. Kamailio proxies the
# desk leg to Asterisk on an internal socket, and Asterisk's carrier leg back out to
# Telnyx on the public socket. Trunk credentials live in Asterisk, not here.
ASTERISK_HOST="${ASTERISK_HOST:-asterisk}"
ASTERISK_SIP_PORT="${ASTERISK_SIP_PORT:-5080}"
KAM_INT_PORT="${KAMAILIO_INTERNAL_SIP_PORT:-5070}"
# rr double record-routing needs a real address on the internal hop: 0.0.0.0 in a
# Route header is unroutable for Asterisk, so advertise the container address.
KAM_INT_IP=$(hostname -i 2>/dev/null | awk '{print $1}')
if [ -z "${KAM_INT_IP}" ]; then
  KAM_INT_IP=$(ip -4 -o addr show scope global 2>/dev/null | awk 'NR==1{split($4,a,"/"); print a[1]}')
fi
if [ -z "${KAM_INT_IP}" ]; then
  KAM_INT_IP=$(getent hosts "$(hostname)" 2>/dev/null | awk 'NR==1{print $1}')
fi
if [ -z "${KAM_INT_IP}" ]; then
  echo "[kamailio] ERROR: cannot determine container address for the internal SIP socket"
  exit 1
fi
sed -i "s|__ASTERISK_HOST__|$(printf '%s' "${ASTERISK_HOST}" | sed 's/[\\/&|]/\\&/g')|g; \
        s|__ASTERISK_SIP_PORT__|${ASTERISK_SIP_PORT}|g; \
        s|__KAMAILIO_INTERNAL_SIP_PORT__|${KAM_INT_PORT}|g; \
        s|__KAM_INTERNAL_IP__|${KAM_INT_IP}|g" "${CFG}"
# loose_route() must recognise the advertised addresses as our own when stripping the
# Route hops we inserted with record_route().
sed -i "s|alias=\"localhost\"|alias=\"localhost\"\nalias=\"${KAM_INT_IP}\"|" "${CFG}"
echo "[kamailio] B2BUA core=${ASTERISK_HOST}:${ASTERISK_SIP_PORT} internal socket=${KAM_INT_IP}:${KAM_INT_PORT}"

# RC1 — advertise shared registrar FQDN for desk phones (alias in Record-Route / domain handling)
SIP_REGISTRAR_HOST="${SIP_REGISTRAR_HOST:-}"
REG_HOST=""
if [ -n "${SIP_REGISTRAR_HOST}" ]; then
  REG_HOST=$(printf '%s' "${SIP_REGISTRAR_HOST}" | sed 's|^[a-zA-Z]*://||' | cut -d: -f1 | sed 's|/$||')
  if [ -n "${REG_HOST}" ]; then
    sed -i "s|alias=\"localhost\"|alias=\"localhost\"\nalias=\"${REG_HOST}\"|" "${CFG}"
    echo "[kamailio] SIP registrar alias=${REG_HOST}"
  fi
fi

# RC1 — public SIP advertise address for Record-Route / ACK / BYE on carrier B2BUA legs.
SIP_PUBLIC_IP="${SIP_PUBLIC_IP:-}"
if [ -n "${SIP_PUBLIC_IP}" ]; then
  ESC_IP=$(printf '%s' "${SIP_PUBLIC_IP}" | sed 's/[\\/&|]/\\&/g')
  sed -i "s|__SIP_PUBLIC_IP__|${ESC_IP}|g" "${CFG}"
  sed -i "s|alias=\"localhost\"|alias=\"localhost\"\nalias=\"${ESC_IP}\"|" "${CFG}"
  echo "[kamailio] SIP advertise address=${SIP_PUBLIC_IP}"
else
  sed -i 's| advertise __SIP_PUBLIC_IP__:5060||g' "${CFG}"
  echo "[kamailio] WARNING: SIP_PUBLIC_IP unset — Record-Route may use 0.0.0.0 (lab only)"
fi

# Desk-facing 200 OK Contact domain (registrar FQDN, e.g. sip.vspphone.com).
DESK_CONTACT_DOMAIN="${REG_HOST:-${SIP_PUBLIC_IP:-sip.localhost}}"
ESC_DOMAIN=$(printf '%s' "${DESK_CONTACT_DOMAIN}" | sed 's/[\\/&|]/\\&/g')
sed -i "s|__SIP_REGISTRAR_HOST__|${ESC_DOMAIN}|g" "${CFG}"
echo "[kamailio] desk Contact domain=${DESK_CONTACT_DOMAIN}"

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
    /init-kamailio-db.sh
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

if grep -q '__[A-Z_]*__' "${CFG}"; then
  echo "[kamailio] ERROR: unresolved placeholders remain in the runtime config"
  grep -n '__[A-Z_]*__' "${CFG}"
  exit 1
fi

echo "[kamailio] lint: kamailio -c -f ${CFG}"
if ! kamailio -c -f "${CFG}"; then
  echo "[kamailio] configuration validation FAILED"
  exit 1
fi

echo "[kamailio] configuration OK — starting kamailio"
mkdir -p /var/run/kamailio
ln -sf /tmp/kamailio_ctl /var/run/kamailio/kamailio_ctl
exec kamailio -DD -E -f "${RUNTIME_CFG}"
