#!/usr/bin/env bash
# Capture one outbound call from INVITE through teardown; identify BYE sender.
set -euo pipefail
cd /opt/vsp-phone-v4

SEC="${SEC:-120}"
PHONE_IP="${PHONE_IP:-122.177.247.143}"
TELNYX_IP="${TELNYX_IP:-192.76.120.10}"
TELNYX_IP2="${TELNYX_IP2:-64.16.250.10}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/tmp/teardown-capture-${STAMP}"
mkdir -p "$OUT"

log() { echo "[capture-teardown] $*"; }

log "OUT=$OUT — dial PSTN now, hold through disconnect (${SEC}s capture)"
sudo timeout "$SEC" tcpdump -i ens5 -nn -tttt -s0 -w "$OUT/all.pcap" \
  "port 5060 and (host ${PHONE_IP} or host 32.196.41.160 or host ${TELNYX_IP} or host ${TELNYX_IP2} or net 64.16.250.0/24 or net 192.76.120.0/24)" \
  2>"$OUT/tcpdump.err" &
TP1=$!
sudo timeout "$SEC" tcpdump -i any -nn -tttt -s0 -w "$OUT/docker.pcap" \
  "port 5060" \
  2>"$OUT/tcpdump-docker.err" &
TP2=$!
TP="$TP1 $TP2"
(
  timeout "$SEC" docker logs -f vsp-kamailio 2>&1 \
    | grep -iE 'BYE |CANCEL |487 |408 |481 |dlg_ontimeout|Session-Expires|carrier uac ACK|BRIDGE_CARRIER|rtpengine_delete' \
    || true
) >"$OUT/kamailio.log" 2>/dev/null &
KL=$!
(
  timeout "$SEC" docker logs -f vsp-rtpengine 2>&1 \
    | grep -iE 'delete|timeout|BYE|Scheduling deletion' \
    || true
) >"$OUT/rtpengine.log" 2>/dev/null &
RL=$!

sleep "$SEC"
kill "$KL" "$RL" 2>/dev/null || true
wait $TP 2>/dev/null || true

log "pcap bytes ens5: $(wc -c < "$OUT/all.pcap" 2>/dev/null || echo 0)"
log "pcap bytes any: $(wc -c < "$OUT/docker.pcap" 2>/dev/null || echo 0)"
PCAP="$OUT/all.pcap"
if [[ ! -s "$PCAP" && -s "$OUT/docker.pcap" ]]; then
  PCAP="$OUT/docker.pcap"
fi

log "=== SIP methods with src>dst (first 40) ==="
sudo tcpdump -nn -r "$PCAP" 2>/dev/null \
  | grep -E 'SIP: (INVITE|ACK|BYE|CANCEL|UPDATE|re-INVITE|SIP/2.0)' \
  | head -40 | tee "$OUT/methods.txt" || true

log "=== BYE packets (full tcpdump lines) ==="
sudo tcpdump -nn -r "$PCAP" 2>/dev/null \
  | grep -i 'SIP: BYE' | tee "$OUT/bye-lines.txt" || true

log "=== First BYE SIP bodies ==="
sudo tcpdump -nn -A -r "$PCAP" 2>/dev/null \
  | awk '/^BYE sip:|^SIP\/2.0 200 OK/ {show=1} show{print} /^$/ && show{show=0}' \
  | head -80 | tee "$OUT/first-bye.txt" || true

log "=== Session-Expires / Min-SE in capture ==="
sudo tcpdump -nn -A -r "$PCAP" 2>/dev/null \
  | grep -E 'Session-Expires|Min-SE|Supported:.*timer|Require:.*timer|refresher' \
  | sort -u | tee "$OUT/session-timers.txt" || true

log "=== Kamailio tail ==="
tail -30 "$OUT/kamailio.log" | tee "$OUT/kam-tail.txt" || true

log "=== RTPengine tail ==="
tail -20 "$OUT/rtpengine.log" | tee "$OUT/rtpe-tail.txt" || true

{
  echo "teardown_capture utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "out=$OUT"
  echo "bye_count=$(grep -c 'SIP: BYE' "$OUT/bye-lines.txt" 2>/dev/null || echo 0)"
} | tee "$OUT/summary.txt"

log "Done — review $OUT/summary.txt"
