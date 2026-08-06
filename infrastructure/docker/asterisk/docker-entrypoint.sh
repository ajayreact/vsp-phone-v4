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

# Ubuntu builds Asterisk with a multiarch libdir, so the module directory is
# /usr/lib/<triplet>/asterisk/modules. Detect it rather than assuming either layout: an
# astmoddir that does not exist starts Asterisk with no channel drivers at all.
ASTERISK_MODULE_DIR="${ASTERISK_MODULE_DIR:-}"
if [ -z "${ASTERISK_MODULE_DIR}" ]; then
  for cand in /usr/lib/*/asterisk/modules /usr/lib/asterisk/modules /usr/lib64/asterisk/modules; do
    if [ -f "${cand}/chan_pjsip.so" ]; then
      ASTERISK_MODULE_DIR="${cand}"
      break
    fi
  done
fi
if [ -z "${ASTERISK_MODULE_DIR}" ]; then
  echo "[asterisk] FATAL: cannot locate chan_pjsip.so — no usable module directory"
  exit 1
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
E_MOD_DIR=$(esc "${ASTERISK_MODULE_DIR}")

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
      -e "s|__ASTERISK_MODULE_DIR__|${E_MOD_DIR}|g" \
      "${tpl}" > "${out}"
  chown asterisk:asterisk "${out}" 2>/dev/null || true
  chmod 640 "${out}"
  echo "[asterisk] rendered ${out}"
done

for tpl in "${TPL_DIR}"/*.conf; do
  [ -f "${tpl}" ] || continue
  out="${CFG_DIR}/$(basename "${tpl}")"
  if grep -q '__[A-Z_]*__' "${out}"; then
    echo "[asterisk] ERROR: unresolved placeholders remain in ${out}"
    grep -n '__[A-Z_]*__' "${out}"
    exit 1
  fi
done

for dir in /var/run/asterisk /var/log/asterisk /var/spool/asterisk /var/lib/asterisk; do
  mkdir -p "${dir}"
  chown -R asterisk:asterisk "${dir}" 2>/dev/null || true
done

echo "[asterisk] modules=${ASTERISK_MODULE_DIR}"
echo "[asterisk] sip=${ASTERISK_SIP_PORT}/udp rtp=${ASTERISK_RTP_PORT_MIN}-${ASTERISK_RTP_PORT_MAX}"
echo "[asterisk] edge=${KAMAILIO_HOST}:${KAMAILIO_INTERNAL_PORT} trunk=${TELNYX_SIP_HOST} (via edge outbound proxy)"
echo "[asterisk] starting Asterisk B2BUA carrier core"

exec asterisk -f -U asterisk -G asterisk -vvv
