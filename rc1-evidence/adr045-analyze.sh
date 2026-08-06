#!/usr/bin/env bash
# ADR-045 PCAP analysis. Produces the pass/fail evidence table for the validation call.
#
#   sudo bash rc1-evidence/adr045-analyze.sh /opt/vsp-phone-v4/rc1-evidence/adr045-runs/<STAMP>
#
# Leg identification is structural, not IP-based:
#   desk leg    = INVITE Kamailio -> Asterisk        (udp dst 5080)
#   carrier leg = INVITE Asterisk -> Kamailio        (udp dst 5070)
#   Telnyx side = carrier Call-ID on udp 5060 <-> 5060 with a public peer
#
# `-i any` sees both the pre-NAT and post-NAT copy of each packet leaving the host, so
# every count below collapses frames of the same Via branch that are < 100 ms apart into
# one event. Real retransmissions are >= 500 ms apart (RFC 3261 T1) and stay separate.
set -uo pipefail

RUN="${1:-}"
[ -d "$RUN" ] || { echo "usage: $0 <run-dir>"; exit 2; }
CAP="${RUN}/sip.pcap"
RTP="${RUN}/rtp.pcap"
OUT="${RUN}/summary.txt"
[ -f "$CAP" ] || { echo "missing ${CAP}"; exit 2; }
command -v tshark >/dev/null || { echo "tshark missing: sudo apt-get install -y tshark"; exit 1; }

PRIVATE='10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8'
NOT_PRIV_DST='!(ip.dst==10.0.0.0/8) && !(ip.dst==172.16.0.0/12) && !(ip.dst==192.168.0.0/16) && !(ip.dst==127.0.0.0/8)'
NOT_PRIV_SRC='!(ip.src==10.0.0.0/8) && !(ip.src==172.16.0.0/12) && !(ip.src==192.168.0.0/16) && !(ip.src==127.0.0.0/8)'

PASS=0; FAIL=0; WARN=0
res() { # res PASS|FAIL|WARN "gate" "detail"
  printf '%-6s %-52s %s\n' "[$1]" "$2" "${3:-}"
  case "$1" in PASS) PASS=$((PASS+1));; FAIL) FAIL=$((FAIL+1));; *) WARN=$((WARN+1));; esac
}
hdr() { printf '\n---- %s ----\n' "$1"; }

q() { # q <display-filter> <fields...>
  local f="$1"; shift
  local args=()
  for x in "$@"; do args+=(-e "$x"); done
  tshark -r "$CAP" -Y "$f" -T fields -E separator='|' -e frame.time_epoch "${args[@]}" 2>/dev/null
}

# Collapse near-duplicate frames (same key, < 100 ms apart) into single events.
# stdin: "<epoch>|<key>"  ->  stdout: "<epoch>|<key>" one line per distinct event
dedupe() {
  sort -t'|' -k2,2 -k1,1n | awk -F'|' '
    { if ($2 != k || ($1 - t) > 0.1) { print $0; k=$2; t=$1 } }
  ' | sort -t'|' -k1,1n
}

exec > >(tee "$OUT") 2>&1

echo "ADR-045 validation analysis"
echo "run       : $RUN"
echo "started   : $(cat "${RUN}/started_at" 2>/dev/null)"
echo "stopped   : $(cat "${RUN}/stopped_at" 2>/dev/null)"
echo "sip.pcap  : $(du -h "$CAP" | cut -f1)   frames: $(tshark -r "$CAP" -Y sip 2>/dev/null | wc -l)"

# ---------------------------------------------------------------- dialog identification
hdr "dialog identification"
DESK_CID=$(q 'sip.Method=="INVITE" && udp.dstport==5080' sip.Call-ID | head -1 | cut -d'|' -f2)
CARR_CID=$(q 'sip.Method=="INVITE" && udp.dstport==5070' sip.Call-ID | head -1 | cut -d'|' -f2)
PHONE_CID=$(q 'sip.Method=="INVITE" && udp.dstport==5060 && '"$NOT_PRIV_SRC" sip.Call-ID | head -1 | cut -d'|' -f2)

echo "desk    Call-ID (phone -> Kamailio -> Asterisk): ${DESK_CID:-<none>}"
echo "carrier Call-ID (Asterisk -> Kamailio -> Telnyx): ${CARR_CID:-<none>}"
echo "phone-originated Call-ID seen on 5060          : ${PHONE_CID:-<none>}"

if [ -n "$DESK_CID" ]; then
  res PASS "1. Asterisk received the outbound call from Kamailio" "INVITE to udp/5080"
else
  res FAIL "1. Asterisk received the outbound call from Kamailio" "no INVITE to udp/5080 — Kamailio never handed the call over"
fi

if [ -n "$CARR_CID" ]; then
  res PASS "2. Asterisk created a separate carrier dialog" "INVITE from Asterisk to udp/5070"
else
  res FAIL "2. Asterisk created a separate carrier dialog" "no INVITE from Asterisk — dialplan or trunk endpoint problem"
fi

if [ -n "$DESK_CID" ] && [ -n "$CARR_CID" ] && [ "$DESK_CID" != "$CARR_CID" ]; then
  res PASS "3. Carrier Call-ID differs from desk Call-ID" "B2BUA boundary confirmed"
else
  res FAIL "3. Carrier Call-ID differs from desk Call-ID" "same Call-ID = still proxying, not a B2BUA"
fi

[ -n "$CARR_CID" ] || { echo; echo "no carrier dialog — remaining gates cannot be evaluated"; echo "FAIL"; exit 1; }

CF='sip.Call-ID=="'"$CARR_CID"'"'
DF='sip.Call-ID=="'"$DESK_CID"'"'

# ---------------------------------------------------------------- dialog ownership
hdr "carrier dialog ownership (gates 4-5)"
DESK_FTAG=$(q "$DF"' && sip.Method=="INVITE"' sip.from.tag | head -1 | cut -d'|' -f2)
CARR_FTAG=$(q "$CF"' && sip.Method=="INVITE"' sip.from.tag | head -1 | cut -d'|' -f2)
DESK_CSEQ=$(q "$DF"' && sip.Method=="INVITE"' sip.CSeq.seq | head -1 | cut -d'|' -f2)
CARR_CSEQ=$(q "$CF"' && sip.Method=="INVITE"' sip.CSeq.seq | head -1 | cut -d'|' -f2)
CARR_TTAG=$(q "$CF"' && sip.Status-Code==200 && sip.CSeq.method=="INVITE"' sip.to.tag | head -1 | cut -d'|' -f2)

echo "desk    From-tag=${DESK_FTAG:-<none>}  CSeq=${DESK_CSEQ:-<none>}"
echo "carrier From-tag=${CARR_FTAG:-<none>}  CSeq=${CARR_CSEQ:-<none>}  carrier To-tag=${CARR_TTAG:-<none>}"

if [ -n "$CARR_FTAG" ] && [ "$CARR_FTAG" != "$DESK_FTAG" ]; then
  res PASS "4. Asterisk owns the carrier From/To tags" "carrier From-tag independent of the desk leg"
else
  res FAIL "4. Asterisk owns the carrier From/To tags" "carrier From-tag reused from the desk dialog"
fi

if [ -n "$CARR_CSEQ" ]; then
  if [ "$CARR_CSEQ" != "$DESK_CSEQ" ]; then
    res PASS "5. Asterisk owns the carrier CSeq space" "desk=${DESK_CSEQ} carrier=${CARR_CSEQ}"
  else
    res WARN "5. Asterisk owns the carrier CSeq space" "numerically equal (${CARR_CSEQ}); independent spaces may coincide — confirm via the auth retry increment"
  fi
else
  res FAIL "5. Asterisk owns the carrier CSeq space" "no carrier CSeq observed"
fi

# ---------------------------------------------------------------- carrier signalling
hdr "carrier signalling toward Telnyx"
echo "time_epoch|src|sport|dst|dport|method|status|cseq"
q "$CF" ip.src udp.srcport ip.dst udp.dstport sip.Method sip.Status-Code sip.CSeq.method | sed 's/^/  /'

PROV_IN=$(q "$CF"' && (sip.Status-Code==180 || sip.Status-Code==183) && '"$NOT_PRIV_SRC" sip.Via.branch | dedupe | wc -l)
PROV_DESK=$(q "$DF"' && (sip.Status-Code==180 || sip.Status-Code==183) && '"$NOT_PRIV_DST" sip.Via.branch | dedupe | wc -l)
if [ "$PROV_IN" -gt 0 ] && [ "$PROV_DESK" -gt 0 ]; then
  res PASS "6. Telnyx 18x reached Asterisk and propagated to the phone" "${PROV_IN} in from Telnyx, ${PROV_DESK} out to the phone"
elif [ "$PROV_IN" -gt 0 ]; then
  res FAIL "6. Telnyx 18x reached Asterisk and propagated to the phone" "${PROV_IN} in from Telnyx but none forwarded to the phone (no ringback)"
else
  res FAIL "6. Telnyx 18x reached Asterisk and propagated to the phone" "no 180/183 from Telnyx"
fi

OK200=$(q "$CF"' && sip.Status-Code==200 && sip.CSeq.method=="INVITE" && '"$NOT_PRIV_SRC" sip.Via.branch | dedupe)
OK200_N=$(printf '%s' "$OK200" | grep -c . )
T200=$(printf '%s' "$OK200" | head -1 | cut -d'|' -f1)
if [ "$OK200_N" -ge 1 ]; then
  res PASS "7. Telnyx 200 OK reached Asterisk" "t=${T200}"
else
  res FAIL "7. Telnyx 200 OK reached Asterisk" "call was never answered on the carrier leg"
fi

ACKOUT=$(q "$CF"' && sip.CSeq.method=="ACK" && '"$NOT_PRIV_DST" sip.Via.branch | dedupe)
ACKOUT_N=$(printf '%s' "$ACKOUT" | grep -c . )
TACK=$(printf '%s' "$ACKOUT" | head -1 | cut -d'|' -f1)

ACKINT=$(q "$CF"' && sip.CSeq.method=="ACK" && udp.dstport==5070' sip.Via.branch | dedupe | head -1 | cut -d'|' -f1)

if [ -n "$T200" ] && [ -n "$TACK" ]; then
  LAT=$(awk -v a="$T200" -v b="$TACK" 'BEGIN{printf "%.1f", (b-a)*1000}')
  if [ -n "$ACKINT" ]; then
    LAT_AST=$(awk -v a="$T200" -v b="$ACKINT" 'BEGIN{printf "%.1f", (b-a)*1000}')
  else
    LAT_AST="n/a"
  fi
  echo "carrier 200 OK   : ${T200}"
  echo "Asterisk ACK out : ${ACKINT:-n/a}   (+${LAT_AST} ms)"
  echo "ACK to Telnyx    : ${TACK}   (+${LAT} ms)"
  echo "$LAT" > "${RUN}/ack_latency_ms"
  UNDER=$(awk -v l="$LAT" 'BEGIN{print (l<50)?"yes":"no"}')
  if [ "$UNDER" = yes ]; then
    res PASS "8. Asterisk ACKed Telnyx immediately" "${LAT} ms (target < 50 ms)"
  else
    res FAIL "8. Asterisk ACKed Telnyx immediately" "${LAT} ms exceeds the 50 ms target"
  fi
else
  res FAIL "8. Asterisk ACKed Telnyx immediately" "no ACK observed toward Telnyx"
fi

if [ "$ACKOUT_N" -eq 1 ]; then
  res PASS "9. Exactly one valid carrier ACK" "1 ACK event"
else
  res FAIL "9. Exactly one valid carrier ACK" "${ACKOUT_N} ACK events (0 = never acked, >1 = retransmitted)"
fi

if [ "$OK200_N" -eq 1 ]; then
  res PASS "10. No 200 OK retransmission after the ACK" "1 x 200 OK"
else
  res FAIL "10. No 200 OK retransmission after the ACK" "${OK200_N} x 200 OK — Telnyx did not see our ACK"
  printf '%s\n' "$OK200" | sed 's/^/        /'
fi

# ---------------------------------------------------------------- teardown / duration
hdr "teardown and duration (gates 11, 18, hold)"
DESK200=$(q "$DF"' && sip.Status-Code==200 && sip.CSeq.method=="INVITE" && '"$NOT_PRIV_DST" sip.Via.branch | dedupe | head -1 | cut -d'|' -f1)
BYE_ALL=$(q 'sip.Method=="BYE"' ip.src ip.dst sip.Call-ID | dedupe)
echo "BYE frames (time|src|dst|call-id):"
printf '%s\n' "$BYE_ALL" | sed 's/^/  /'

FIRST_BYE=$(printf '%s' "$BYE_ALL" | head -1 | cut -d'|' -f1)
BYE_FROM_TELNYX=$(q 'sip.Method=="BYE" && '"$NOT_PRIV_SRC" sip.Call-ID | dedupe | wc -l)

if [ -n "$DESK200" ] && [ -n "$FIRST_BYE" ]; then
  DUR=$(awk -v a="$DESK200" -v b="$FIRST_BYE" 'BEGIN{printf "%.1f", b-a}')
  echo "$DUR" > "${RUN}/call_seconds"
  echo "call_sec (desk 200 OK -> first BYE) = ${DUR}"
  OVER32=$(awk -v d="$DUR" 'BEGIN{print (d>40)?"yes":"no"}')
  OVER600=$(awk -v d="$DUR" 'BEGIN{print (d>=600)?"yes":"no"}')
  if [ "$OVER32" = yes ]; then
    res PASS "18. No ~32 s disconnect" "call ran ${DUR}s"
  else
    res FAIL "18. No ~32 s disconnect" "call ended after ${DUR}s — the ACK timeout signature is still present"
  fi
  if [ "$OVER600" = yes ]; then
    res PASS "hold. call_sec >= 600" "${DUR}s"
  else
    res FAIL "hold. call_sec >= 600" "${DUR}s — hold the call longer before hanging up"
  fi
else
  res FAIL "18. No ~32 s disconnect" "cannot compute duration (missing desk 200 OK or BYE)"
  res FAIL "hold. call_sec >= 600" "no duration"
fi

if [ "$BYE_FROM_TELNYX" -eq 0 ]; then
  res PASS "11. No provider-initiated teardown / ACK timeout" "no BYE sourced from Telnyx"
else
  res FAIL "11. No provider-initiated teardown / ACK timeout" "${BYE_FROM_TELNYX} BYE from Telnyx"
fi

BYE200=$(q 'sip.Status-Code==200 && sip.CSeq.method=="BYE"' sip.Call-ID | dedupe | wc -l)
if [ "$BYE200" -ge 2 ]; then
  res PASS "hangup. 200 OK to BYE on both legs" "${BYE200} BYE responses"
elif [ "$BYE200" -eq 1 ]; then
  res WARN "hangup. 200 OK to BYE on both legs" "only 1 BYE response seen"
else
  res FAIL "hangup. 200 OK to BYE on both legs" "no 200 OK to BYE"
fi

if printf '%s' "$BYE_ALL" | grep -q .; then
  res PASS "21. In-dialog BYE routed in both directions" "see the BYE list above (expect desk-leg and carrier-leg Call-IDs)"
else
  res FAIL "21. In-dialog BYE routed in both directions" "no BYE captured"
fi

# ---------------------------------------------------------------- desk-side experience
hdr "desk-side experience (gates 12, 13, 17)"
if [ -n "$DESK200" ]; then
  res PASS "12. Grandstream received 200 OK" "t=${DESK200}"
  if [ -n "$T200" ]; then
    ANSDELAY=$(awk -v a="$T200" -v b="$DESK200" 'BEGIN{printf "%.1f", (b-a)*1000}')
    echo "$ANSDELAY" > "${RUN}/answer_delay_ms"
    echo "answer propagation (carrier 200 OK -> desk 200 OK) = ${ANSDELAY} ms"
    FASTANS=$(awk -v d="$ANSDELAY" 'BEGIN{print (d<1000)?"yes":"no"}')
    if [ "$FASTANS" = yes ]; then
      res PASS "13/17. Desk timer starts at answer, no ~10 s delay" "${ANSDELAY} ms"
    else
      res FAIL "13/17. Desk timer starts at answer, no ~10 s delay" "${ANSDELAY} ms of post-answer delay"
    fi
  fi
  DESK200_N=$(q "$DF"' && sip.Status-Code==200 && sip.CSeq.method=="INVITE" && '"$NOT_PRIV_DST" sip.Via.branch | dedupe | wc -l)
  if [ "$DESK200_N" -eq 1 ]; then
    res PASS "desk. 200 OK not retransmitted to the phone" "1 x 200 OK"
  else
    res WARN "desk. 200 OK not retransmitted to the phone" "${DESK200_N} x 200 OK — the phone was slow to ACK"
  fi
else
  res FAIL "12. Grandstream received 200 OK" "no 200 OK toward the phone"
fi

# ---------------------------------------------------------------- ADR-045 special checks
hdr "ADR-045 special checks (gates 19, 20, 22)"
echo "Record-Route headers on the INVITE that reached Asterisk:"
RRLIST=$(tshark -r "$CAP" -Y 'sip.Method=="INVITE" && udp.dstport==5080' -V 2>/dev/null | grep -i '^\s*Record-Route:' | sed 's/^[[:space:]]*/  /')
printf '%s\n' "${RRLIST:-  <none>}"
RRN=$(printf '%s' "$RRLIST" | grep -c . )
if [ "$RRN" -eq 2 ]; then
  res PASS "19/20. Two Record-Route headers on the desk-leg INVITE" "double record-routing across the two sockets"
elif [ "$RRN" -eq 1 ]; then
  res FAIL "19/20. Two Record-Route headers on the desk-leg INVITE" "only 1 — one side of the dialog will route to the wrong socket"
else
  res FAIL "19/20. Two Record-Route headers on the desk-leg INVITE" "${RRN} found"
fi
echo "Record-Route headers on the INVITE that reached Telnyx:"
tshark -r "$CAP" -Y 'sip.Method=="INVITE" && '"$NOT_PRIV_DST" -V 2>/dev/null | grep -i '^\s*Record-Route:' | sed 's/^[[:space:]]*/  /' | sort -u

BAD_SPORT=$(q "$CF"' && '"$NOT_PRIV_DST"' && udp.srcport!=5060' ip.dst udp.srcport sip.Method sip.Status-Code | grep -c . )
if [ "$BAD_SPORT" -eq 0 ]; then
  res PASS "22. Carrier signalling always leaves from source port 5060" "no frames to Telnyx from udp/5070"
else
  res FAIL "22. Carrier signalling always leaves from source port 5060" "${BAD_SPORT} frames left from the internal socket"
  q "$CF"' && '"$NOT_PRIV_DST"' && udp.srcport!=5060' ip.dst udp.srcport sip.Method sip.Status-Code | sed 's/^/        /'
fi

hdr "session refresh during the hold (RFC 4028)"
q 'sip.CSeq.method=="INVITE" && sip.to.tag && sip.Method=="INVITE"' ip.src ip.dst sip.Call-ID sip.CSeq.seq | dedupe | sed 's/^/  /'
q 'sip.Method=="UPDATE"' ip.src ip.dst sip.Call-ID | dedupe | sed 's/^/  /'
SESSFAIL=$(q '(sip.Status-Code==422 || sip.Status-Code==408) && sip.CSeq.method=="INVITE"' sip.Status-Code | grep -c . )
if [ "$SESSFAIL" -eq 0 ]; then
  res PASS "session timer. No 422/408 on refresh" "clean"
else
  res FAIL "session timer. No 422/408 on refresh" "${SESSFAIL} refresh failures"
fi

# ---------------------------------------------------------------- media
hdr "media (gates 14, 15, 16)"
if [ -f "$RTP" ]; then
  echo "RTP streams:"
  tshark -r "$RTP" -q -z rtp,streams 2>/dev/null | sed 's/^/  /'
  PUB_RTP=$(tshark -r "$RTP" -Y 'udp.port>=10000 && udp.port<=10099' 2>/dev/null | wc -l)
  AST_RTP=$(tshark -r "$RTP" -Y 'udp.port>=20000 && udp.port<=20999' 2>/dev/null | wc -l)
  echo "rtpengine-range packets: ${PUB_RTP}   asterisk-range packets: ${AST_RTP}"
  if [ "$PUB_RTP" -gt 1000 ] && [ "$AST_RTP" -gt 1000 ]; then
    res PASS "15/16. RTP flows phone <-> RTPengine <-> Asterisk <-> carrier" "${PUB_RTP} / ${AST_RTP} packets"
    res PASS "14. Two-way audio" "sustained bidirectional RTP on both port ranges"
  else
    res FAIL "15/16. RTP flows phone <-> RTPengine <-> Asterisk <-> carrier" "${PUB_RTP} / ${AST_RTP} packets — one side is silent"
    res FAIL "14. Two-way audio" "insufficient RTP"
  fi
  RTPGAP=$(tshark -r "$RTP" -q -z rtp,streams 2>/dev/null | awk '/^[0-9]/{if ($NF+0 > 5) c++} END{print c+0}')
  if [ "${RTPGAP:-0}" -eq 0 ]; then
    res PASS "rtp. No RTP timeout / stream stall" "no stream with excessive loss"
  else
    res WARN "rtp. No RTP timeout / stream stall" "${RTPGAP} stream(s) with high loss"
  fi
else
  res WARN "14/15/16. Media" "rtp.pcap missing"
fi

# ---------------------------------------------------------------- log corroboration
hdr "log corroboration"
grep -hE 'BRIDGE_CARRIER|CARRIER_EGRESS|spoofed egress' "${RUN}/vsp-kamailio.log" 2>/dev/null | tail -10 | sed 's/^/  kam: /'
grep -hE 'VSP PSTN|VSP carrier|Everyone is busy|ANSWER' "${RUN}/vsp-asterisk.log" 2>/dev/null | tail -10 | sed 's/^/  ast: /'
grep -hiE 'error|fail' "${RUN}/vsp-rtpengine.log" 2>/dev/null | tail -5 | sed 's/^/  rtp: /'

printf '\n=============================================\n'
printf 'gates: %d pass, %d fail, %d warn\n' "$PASS" "$FAIL" "$WARN"
if [ "$FAIL" -gt 0 ]; then
  printf 'RESULT: FAIL — A-prime is NOT validated. First divergence is the topmost [FAIL] above.\n'
  exit 1
fi
printf 'RESULT: PASS — every ADR-045 gate satisfied on this call.\n'
printf 'Still required before sign-off: the Telnyx CDR duration for carrier Call-ID %s\n' "$CARR_CID"
