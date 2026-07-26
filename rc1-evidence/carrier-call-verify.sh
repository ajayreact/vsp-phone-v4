#!/usr/bin/env bash
# End-to-end desk → Kamailio → Telnyx carrier call verification.
# Usage: PHONE_IP=122.177.247.143 DIAL=13174492106 SEC=120 ./carrier-call-verify.sh
set -euo pipefail

PHONE_IP="${PHONE_IP:-122.177.247.143}"
DIAL="${DIAL:-13174492106}"
SEC="${SEC:-120}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/tmp/carrier-verify-${STAMP}"
TELNYX_IP="${TELNYX_IP:-192.76.120.10}"

mkdir -p "$OUT"
log() { echo "[carrier-verify] $*"; }

log "OUT=$OUT — dial ${DIAL}# on desk phone when prompted"
log "Capturing phone SIP + Telnyx SIP for ${SEC}s"

sudo timeout "$SEC" tcpdump -i any -nn -tttt -s0 -w "$OUT/phone.pcap" "host ${PHONE_IP} and port 5060" 2>"$OUT/phone.err" &
P1=$!
sudo timeout "$SEC" tcpdump -i any -nn -tttt -s0 -w "$OUT/telnyx.pcap" "host ${TELNYX_IP} and port 5060" 2>"$OUT/telnyx.err" &
P2=$!
(
  timeout "$SEC" docker logs -f vsp-kamailio 2>&1 \
    | grep -iE "RC1_DESK_INVITE|BRIDGE_CARRIER|from_rewritten|carrier auth|carrier leg failed|carrier auth stale" \
    || true
) >"$OUT/kamailio.log" 2>"$OUT/kamailio.err" &
K1=$!

sleep 3
log ">>> DIAL NOW: ${DIAL} then press #"
sleep "$SEC"

wait "$P1" "$P2" 2>/dev/null || true
kill "$K1" 2>/dev/null || true

WIRE_INV=$(sudo tcpdump -nn -r "$OUT/phone.pcap" 2>/dev/null | grep -c "${PHONE_IP}.*>.*5060.*INVITE" || true)
WIRE_INV=${WIRE_INV:-0}
KAM_INV=$(grep -c RC1_DESK_INVITE "$OUT/kamailio.log" 2>/dev/null || true)
KAM_INV=${KAM_INV:-0}
TX_INV=$(sudo tcpdump -nn -A -r "$OUT/telnyx.pcap" 2>/dev/null | grep -c 'INVITE sip:' || true)
TX_INV=${TX_INV:-0}
PPI_ON_TX=$(sudo tcpdump -nn -A -r "$OUT/telnyx.pcap" 2>/dev/null | grep -c 'P-Preferred-Identity' || true)
PPI_ON_TX=${PPI_ON_TX:-0}

{
  echo "carrier_call_verify utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "out=$OUT dial=$DIAL phone_ip=$PHONE_IP"
  echo "wire_invite_phone_to_kam=$WIRE_INV"
  echo "kamailio_desk_invite=$KAM_INV"
  echo "telnyx_invite_count=$TX_INV"
  echo "telnyx_ppi_headers=$PPI_ON_TX"
  echo "--- kamailio tail ---"
  tail -20 "$OUT/kamailio.log" 2>/dev/null || true
} | tee "$OUT/summary.txt"

if [ -f /opt/vsp-phone-v4/rc1-evidence/recent-call-logs.sh ]; then
  bash /opt/vsp-phone-v4/rc1-evidence/recent-call-logs.sh | head -20 >"$OUT/cdr.txt" 2>/dev/null || true
fi

log "Done. Review: $OUT/summary.txt"
