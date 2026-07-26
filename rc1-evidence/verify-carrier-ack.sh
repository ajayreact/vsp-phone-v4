#!/usr/bin/env bash
# Capture one outbound carrier call and verify post-answer ACK targets Telnyx Contact
# (not sip.telnyx.com). Success: ACK R-URI contains @10. and call_sec >> 32.
set -euo pipefail
cd /opt/vsp-phone-v4

TELNYX_IP="${TELNYX_IP:-192.76.120.10}"
SEC="${SEC:-120}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/tmp/carrier-ack-verify-${STAMP}"
mkdir -p "$OUT"

log() { echo "[verify-carrier-ack] $*"; }

CAP_IF="${CAP_IF:-ens5}"
log "Capturing Telnyx SIP on ${CAP_IF} for ${SEC}s — dial 13174492106# now"
sudo timeout "$SEC" tcpdump -i "$CAP_IF" -nn -tttt -s0 -w "$OUT/telnyx.pcap" "host ${TELNYX_IP} and port 5060" 2>"$OUT/tcpdump.err" &
TP=$!
(
  timeout "$SEC" docker logs -f vsp-kamailio 2>&1 \
    | grep -E 'carrier 200 OK contact=|carrier local ACK|BRIDGE_CARRIER' \
    || true
) >"$OUT/kamailio.log" 2>/dev/null &
KP=$!

sleep "$SEC"
wait "$TP" 2>/dev/null || true
kill "$KP" 2>/dev/null || true

log "=== Kamailio carrier ACK lines ==="
tail -20 "$OUT/kamailio.log" || true

log "=== Wire ACK Request-URIs toward Telnyx ==="
sudo tcpdump -nn -A -r "$OUT/telnyx.pcap" 2>/dev/null \
  | grep -E '^ACK sip:' | sort -u | tee "$OUT/ack-lines.txt" || true

GOOD=$(grep -c '@10\.' "$OUT/ack-lines.txt" 2>/dev/null || true)
BAD=$(grep -c 'sip.telnyx.com' "$OUT/ack-lines.txt" 2>/dev/null || true)
GOOD=${GOOD:-0}
BAD=${BAD:-0}

log "ACK to Telnyx Contact (@10.*): $GOOD"
log "ACK to sip.telnyx.com (broken): $BAD"

if [ -f rc1-evidence/recent-call-logs.sh ]; then
  log "=== Latest Telnyx CDR call_sec ==="
  bash rc1-evidence/recent-call-logs.sh 2>/dev/null | grep call_sec | head -5 | tee "$OUT/cdr.txt" || true
fi

{
  echo "verify_carrier_ack utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "out=$OUT good_ack=$GOOD bad_ack=$BAD"
  echo "pass=$([ "$GOOD" -gt 0 ] && [ "$BAD" -eq 0 ] && echo yes || echo no)"
} | tee "$OUT/summary.txt"

log "Done — review $OUT/summary.txt"
