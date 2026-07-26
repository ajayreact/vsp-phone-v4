#!/usr/bin/env bash
# Deploy Grandstream desk fix + validate syslog and outbound INVITE.
# Run on EC2: /opt/vsp-phone-v4/rc1-evidence/grandstream-desk-fix.sh
#
# Requires in /opt/vsp-phone-v4/.env:
#   SIP_PUBLIC_IP=32.196.41.160
#   GRANDSTREAM_SYSLOG_HOST=32.196.41.160  (or leave empty to use SIP_PUBLIC_IP)
#
# Usage:
#   export MAC=ec74d751e3e7
#   export PHONE_IP=122.177.247.143
#   export DIAL=13174492106
#   ./grandstream-desk-fix.sh deploy|verify-cfg|verify-syslog|verify-call|all
set -euo pipefail

ROOT="${ROOT:-/opt/vsp-phone-v4}"
MAC="${MAC:-ec74d751e3e7}"
PHONE_IP="${PHONE_IP:-122.177.247.143}"
DIAL="${DIAL:-13174492106}"
PROV_URL="${PROV_URL:-https://prov.vspphone.com/gs/${MAC}/cfg.xml}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file ${ROOT}/.env}"

cd "$ROOT"

load_env() {
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env" 2>/dev/null || true
  set +a
  export SIP_PUBLIC_IP="${GRANDSTREAM_SYSLOG_HOST:-${SIP_PUBLIC_IP:-}}"
  export GRANDSTREAM_SYSLOG_HOST="${GRANDSTREAM_SYSLOG_HOST:-${SIP_PUBLIC_IP:-}}"
}

deploy() {
  load_env
  if [[ -z "${GRANDSTREAM_SYSLOG_HOST:-}" ]]; then
    echo "ERROR: set SIP_PUBLIC_IP or GRANDSTREAM_SYSLOG_HOST in ${ROOT}/.env"
    exit 1
  fi
  echo "=== git pull + rebuild api (template 1.4.0 desk P-values) ==="
  git pull
  grep -q GRANDSTREAM_SYSLOG_HOST .env 2>/dev/null || {
    cat >> .env <<EOF

# Grandstream desk phone RC1 fix
SIP_PUBLIC_IP=${GRANDSTREAM_SYSLOG_HOST}
GRANDSTREAM_SYSLOG_HOST=${GRANDSTREAM_SYSLOG_HOST}
GRANDSTREAM_SYSLOG_PORT=514
GRANDSTREAM_SYSLOG_LEVEL=1
GRANDSTREAM_SYSLOG_SEND_SIP=true
GRANDSTREAM_DESK_EARLY_DIAL=true
GRANDSTREAM_DESK_PCMU_ONLY=true
GRANDSTREAM_DESK_FORCE_REBOOT=true
EOF
  }
  $COMPOSE build api
  $COMPOSE up -d api
  sleep 15
  echo "=== force-regenerate served cfg for MAC ${MAC} ==="
  $COMPOSE exec -T api node scripts/platform/reprovision-grandstream-desk.cjs --mac "${MAC}"
  echo "Phone will auto-fetch cfg (P22421 forces reboot when P-values apply)."
}

verify_cfg() {
  load_env
  OUT="/tmp/gs-cfg-${MAC}-$(date -u +%Y%m%dT%H%M%SZ).xml"
  echo "=== fetch served cfg ==="
  curl -sk "$PROV_URL" -o "$OUT"
  echo "saved: $OUT"
  echo "--- required P-values ---"
  grep -E '<P207>|<P208>|<P1387>|<P729>|<P22421>|<P290>|<P47>|<P48>' "$OUT" || true
  if ! grep -q "<P207>${GRANDSTREAM_SYSLOG_HOST}" "$OUT" && ! grep -q "<P207>${GRANDSTREAM_SYSLOG_HOST}:514" "$OUT"; then
    echo "FAIL: P207 syslog server missing or wrong in served cfg"
    exit 1
  fi
  if ! grep -q '<P208>1</P208>' "$OUT"; then
    echo "FAIL: P208 DEBUG missing"
    exit 1
  fi
  echo "PASS: served cfg contains syslog + desk fix P-values"
}

verify_syslog() {
  load_env
  export PHONE_IP
  cd "${ROOT}/rc1-evidence"
  chmod +x grandstream-syslog-check.sh mode-b-verify.sh grandstream-pcap-fallback.sh 2>/dev/null || true
  echo "=== listen 45s for UDP/514 from phone (reboot phone if idle) ==="
  if ! ./grandstream-syslog-check.sh --listen 45; then
    echo ">>> Syslog still empty — run packet-capture fallback:"
    ./grandstream-pcap-fallback.sh
    return 1
  fi
}

verify_call() {
  load_env
  export PHONE_IP DIAL SEC=180
  cd "${ROOT}/rc1-evidence"
  echo "=== Mode B capture — dial ${DIAL} during window ==="
  ./mode-b-verify.sh
  OUT=$(ls -td /tmp/mode-b-verify-* | head -1)
  echo "=== results ==="
  grep -E 'invite_count|syslog_bytes|register_count' "$OUT/summary.txt"
  INV=$(grep invite_count "$OUT/summary.txt" | head -1)
  if echo "$INV" | grep -q 'invite_count=0'; then
    echo "FAIL: still no INVITE"
    if [[ -f "$OUT/syslog.txt" ]] && [[ "$(wc -c < "$OUT/syslog.txt" | tr -d ' ')" -le 2 ]]; then
      ./grandstream-pcap-fallback.sh || true
    fi
    echo "Check: P729 early dial applied, DND OFF on LCD, dial then press # if early dial still off"
    exit 1
  fi
  echo "PASS: INVITE observed"
}

case "${1:-all}" in
  deploy) deploy ;;
  verify-cfg) verify_cfg ;;
  verify-syslog) verify_syslog ;;
  verify-call) verify_call ;;
  all)
    deploy
    verify_cfg
    echo ">>> Reboot phone now, wait REGISTER, then run: $0 verify-syslog"
    echo ">>> Then place test call and run: $0 verify-call"
    ;;
  *)
    echo "Usage: $0 deploy|verify-cfg|verify-syslog|verify-call|all"
    exit 1
    ;;
esac
