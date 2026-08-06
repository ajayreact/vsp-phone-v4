#!/bin/sh
# Asterisk entrypoint (ADR-045) — render config templates, then run in the foreground.
set -eu

TPL_DIR="${ASTERISK_TEMPLATE_DIR:-/etc/asterisk-template}"
CFG_DIR="/etc/asterisk"

ASTERISK_SIP_PORT="${ASTERISK_SIP_PORT:-5080}"
ASTERISK_RTP_PORT_MIN="${ASTERISK_RTP_PORT_MIN:-20000}"
ASTERISK_RTP_PORT_MAX="${ASTERISK_RTP_PORT_MAX:-20999}"
KAMAILIO_HOST="${KAMAILIO_HOST:-kamailio}"
KAMAILIO_INTERNAL_PORT="${KAMAILIO_INTERNAL_PORT:-5070}"
TELNYX_SIP_HOST="${TELNYX_SIP_HOST:-sip.telnyx.com}"
TELNYX_SIP_USERNAME="${TELNYX_SIP_USERNAME:-}"
TELNYX_SIP_PASSWORD="${TELNYX_SIP_PASSWORD:-}"
REQUIRE_TRUNK="${ASTERISK_REQUIRE_TRUNK:-0}"

if [ ! -d "${TPL_DIR}" ]; then
  echo "[asterisk] ERROR: config template directory missing: ${TPL_DIR}"
  exit 1
fi

if [ -z "${TELNYX_SIP_USERNAME}" ] || [ -z "${TELNYX_SIP_PASSWORD}" ]; then
  if [ "${REQUIRE_TRUNK}" = "1" ] || [ "${REQUIRE_TRUNK}" = "true" ]; then
    echo "[asterisk] FATAL: ASTERISK_REQUIRE_TRUNK set but TELNYX_SIP_USERNAME/PASSWORD are empty"
    exit 1
  fi
  echo "[asterisk] WARNING: Telnyx trunk credentials unset — carrier 407 challenges will fail (lab only)"
  TELNYX_SIP_USERNAME="${TELNYX_SIP_USERNAME:-unset}"
  TELNYX_SIP_PASSWORD="${TELNYX_SIP_PASSWORD:-unset}"
fi

esc() {
  printf '%s' "$1" | sed 's/[\\/&|]/\\&/g'
}

E_SIP_PORT=$(esc "${ASTERISK_SIP_PORT}")
E_RTP_MIN=$(esc "${ASTERISK_RTP_PORT_MIN}")
E_RTP_MAX=$(esc "${ASTERISK_RTP_PORT_MAX}")
E_KAM_HOST=$(esc "${KAMAILIO_HOST}")
E_KAM_PORT=$(esc "${KAMAILIO_INTERNAL_PORT}")
E_TELNYX_HOST=$(esc "${TELNYX_SIP_HOST}")
E_TELNYX_USER=$(esc "${TELNYX_SIP_USERNAME}")
E_TELNYX_PASS=$(esc "${TELNYX_SIP_PASSWORD}")

for tpl in "${TPL_DIR}"/*.conf; do
  [ -f "${tpl}" ] || continue
  name=$(basename "${tpl}")
  out="${CFG_DIR}/${name}"
  sed -e "s|__ASTERISK_SIP_PORT__|${E_SIP_PORT}|g" \
      -e "s|__ASTERISK_RTP_PORT_MIN__|${E_RTP_MIN}|g" \
      -e "s|__ASTERISK_RTP_PORT_MAX__|${E_RTP_MAX}|g" \
      -e "s|__KAMAILIO_HOST__|${E_KAM_HOST}|g" \
      -e "s|__KAMAILIO_INTERNAL_PORT__|${E_KAM_PORT}|g" \
      -e "s|__TELNYX_SIP_HOST__|${E_TELNYX_HOST}|g" \
      -e "s|__TELNYX_SIP_USERNAME__|${E_TELNYX_USER}|g" \
      -e "s|__TELNYX_SIP_PASSWORD__|${E_TELNYX_PASS}|g" \
      "${tpl}" > "${out}"
  chown asterisk:asterisk "${out}" 2>/dev/null || true
  chmod 640 "${out}"
  echo "[asterisk] rendered ${out}"
done

if grep -q '__[A-Z_]*__' "${CFG_DIR}/pjsip.conf"; then
  echo "[asterisk] ERROR: unresolved placeholders remain in pjsip.conf"
  grep -n '__[A-Z_]*__' "${CFG_DIR}/pjsip.conf"
  exit 1
fi

for dir in /var/run/asterisk /var/log/asterisk /var/spool/asterisk /var/lib/asterisk; do
  mkdir -p "${dir}"
  chown -R asterisk:asterisk "${dir}" 2>/dev/null || true
done

echo "[asterisk] sip=${ASTERISK_SIP_PORT}/udp rtp=${ASTERISK_RTP_PORT_MIN}-${ASTERISK_RTP_PORT_MAX}"
echo "[asterisk] edge=${KAMAILIO_HOST}:${KAMAILIO_INTERNAL_PORT} trunk=${TELNYX_SIP_HOST} (via edge outbound proxy)"
echo "[asterisk] starting Asterisk B2BUA carrier core"

exec asterisk -f -U asterisk -G asterisk -vvv
