#!/usr/bin/env bash
# Paired endpoint capture: Zoiper vs Grandstream post-200 ACK on same Kamailio config.
# Run on EC2 during live test. Does NOT change Kamailio or Contact handling.
#
# Usage:
#   export PHONE_IP=122.177.246.92
#   export ZOIPER_IP=49.43.218.12
#   export SEC=300
#   bash rc1-evidence/endpoint-ack-compare-capture.sh
#
# Operator: Zoiper PSTN call (hold 60s+) → Grandstream PSTN call (hold 60s+).
set -euo pipefail

PHONE_IP="${PHONE_IP:?set PHONE_IP (Grandstream public IP)}"
ZOIPER_IP="${ZOIPER_IP:-}"
SEC="${SEC:-300}"
TELNYX_IP="${TELNYX_IP:-192.76.120.10}"
TELNYX_IP2="${TELNYX_IP2:-64.16.250.10}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/tmp/endpoint-ack-compare-${STAMP}"
mkdir -p "$OUT"

FILTER="port 5060 or port 5070"
if [[ -n "$ZOIPER_IP" ]]; then
  HOST_FILTER="(host ${PHONE_IP} or host ${ZOIPER_IP} or host 32.196.41.160 or host ${TELNYX_IP} or host ${TELNYX_IP2} or net 64.16.250.0/24 or net 192.76.120.0/24)"
else
  HOST_FILTER="(host ${PHONE_IP} or host 32.196.41.160 or host ${TELNYX_IP} or host ${TELNYX_IP2} or net 64.16.250.0/24 or net 192.76.120.0/24)"
  echo "WARN: ZOIPER_IP unset — set it for full comparison" >&2
fi

echo "[endpoint-ack-compare] OUT=$OUT SEC=$SEC"
echo "  1) Zoiper → PSTN, hold ≥60s"
echo "  2) Grandstream → PSTN, hold ≥60s"
echo "  3) Wait for capture to finish"

sudo timeout "$SEC" tcpdump -i ens5 -nn -tttt -s0 -w "$OUT/all.pcap" \
  "${HOST_FILTER} and (${FILTER})" 2>"$OUT/tcpdump.err" &
TP=$!

(
  timeout "$SEC" docker logs -f vsp-kamailio 2>&1 \
    | grep -iE 'carrier phone ACK|carrier Record-Route|carrier 200 OK|BYE received|INVITE r-uri' \
    || true
) >"$OUT/kamailio.log" 2>/dev/null &
KL=$!

sleep "$SEC"
kill "$KL" 2>/dev/null || true
wait "$TP" 2>/dev/null || true

REPORT="$OUT/ack-compare.txt"
{
  echo "=== Endpoint ACK compare $STAMP ==="
  echo "phone_ip=$PHONE_IP zoiper_ip=${ZOIPER_IP:-unset}"
  echo
  for label ip in "Grandstream" "$PHONE_IP" "Zoiper" "${ZOIPER_IP:-}"; do
    [[ -z "$ip" ]] && continue
    inv=$(sudo tcpdump -nn -r "$OUT/all.pcap" 2>/dev/null | grep "$ip" | grep -c 'INVITE sip' || echo 0)
    ack=$(sudo tcpdump -nn -r "$OUT/all.pcap" 2>/dev/null | grep "$ip" | grep -c 'ACK sip' || echo 0)
    ok200=$(sudo tcpdump -nn -r "$OUT/all.pcap" 2>/dev/null | grep "$ip" | grep -c '200 OK' || echo 0)
    bye=$(sudo tcpdump -nn -r "$OUT/all.pcap" 2>/dev/null | grep "$ip" | grep -c 'BYE sip' || echo 0)
    post_ack=0
    if [[ "$ack" -gt 0 ]]; then
      post_ack=$(sudo tcpdump -nn -A -s0 -r "$OUT/all.pcap" 2>/dev/null \
        | awk -v ip="$ip" '
          /INVITE sip/ && index($0,ip)>0 { inv=1 }
          inv && /200 OK/ && /CSeq:.*INVITE/ { saw200=1 }
          saw200 && /ACK sip/ && index($0,ip ">")>0 { c++; saw200=0 }
          END { print c+0 }')
    fi
    echo "--- $label ($ip) ---"
    echo "invite=$inv ack_total=$ack post_200_ack=$post_ack 200_ok=$ok200 bye=$bye"
    if [[ "$inv" -gt 0 && "$post_ack" -eq 0 ]]; then
      echo "VERDICT: NO post-200 ACK from $label on wire"
    elif [[ "$post_ack" -gt 0 ]]; then
      echo "VERDICT: post-200 ACK present from $label"
    fi
    echo
  done
  echo "pcap=$OUT/all.pcap"
  echo "kamailio=$OUT/kamailio.log"
} | tee "$REPORT"

echo "[endpoint-ack-compare] Wrote $REPORT"
