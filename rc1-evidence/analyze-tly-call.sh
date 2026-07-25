#!/usr/bin/env bash
set -euo pipefail
PCAP=/tmp/telnyx-fix-validation.pcap
CALL='TLYEOszuw35OP26ZLqtjCg'

echo "=== Complete SIP ladder (Call-ID ${CALL}) ==="
sudo tshark -r "$PCAP" -Y "sip.Call-ID contains \"${CALL}\"" \
  -T fields -e frame.time -e ip.src -e ip.dst -e sip.Method -e sip.Status-Code -e sip.CSeq.method -e sip.CSeq.seq -e sip.User-Agent \
  2>/dev/null | while IFS=$'\t' read -r ts src dst method status cseqm cseqs ua; do
  if [[ -n "$method" ]]; then msg="$method"
  else msg="${status}"
  fi
  leg=""
  if [[ "$src" == "122.177.247.143" ]]; then leg="Zoiper"
  elif [[ "$src" == "172.31.39.116" || "$src" == "32.196.41.160" ]]; then leg="Kamailio"
  elif [[ "$src" == "192.76.120.10" ]]; then leg="Telnyx"
  fi
  to=""
  if [[ "$dst" == "122.177.247.143" ]]; then to="Zoiper"
  elif [[ "$dst" == "172.31.39.116" || "$dst" == "32.196.41.160" ]]; then to="Kamailio"
  elif [[ "$dst" == "192.76.120.10" ]]; then to="Telnyx"
  fi
  printf "%s  %s -> %s  %s (CSeq %s %s)\n" "$ts" "$leg" "$to" "$msg" "$cseqs" "$cseqm"
done

echo ""
echo "=== 183 / PRACK / 200 OK INVITE / BYE (must be absent) ==="
sudo tshark -r "$PCAP" -Y "sip.Call-ID contains \"${CALL}\" && (sip.Status-Code == 183 || sip.Method == PRACK || (sip.Status-Code == 200 && sip.CSeq.method == INVITE) || sip.Method == BYE)" \
  -T fields -e frame.time -e sip.Method -e sip.Status-Code -e sip.CSeq.method 2>/dev/null || echo "(none)"

echo ""
echo "=== RTP on rtpengine port 10010 during call (19:04:03-19:04:21 UTC) ==="
sudo tshark -r "$PCAP" -Y "frame.time >= \"2026-07-25 19:04:03\" && frame.time <= \"2026-07-25 19:04:21\" && udp.port == 10010" \
  -T fields -e frame.time -e ip.src -e ip.dst -e _ws.col.Protocol 2>/dev/null | head -20 || echo "(no RTP on port 10010)"

echo ""
echo "=== 18:57 call to same dest - carrier leg present? ==="
sudo tshark -r "$PCAP" -Y "frame.time >= \"2026-07-25 18:57:30\" && frame.time <= \"2026-07-25 18:57:51\" && sip && (ip.addr == 192.76.120.10 || sip.Method == INVITE || sip.Status-Code == 180)" \
  -T fields -e frame.time -e ip.src -e ip.dst -e sip.Method -e sip.Status-Code 2>/dev/null

echo ""
echo "=== Time delta: auth INVITE -> Telnyx 180 ==="
sudo tshark -r "$PCAP" -Y "sip.Call-ID contains \"${CALL}\"" \
  -T fields -e frame.time_epoch -e sip.Method -e sip.Status-Code -e sip.CSeq.seq -e sip.CSeq.method 2>/dev/null
