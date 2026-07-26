#!/usr/bin/env bash
# Mode B verification — Grandstream never sends INVITE to Kamailio
#
# Captures ALL traffic from PHONE_IP (UDP + TCP, every port), syslog :514, Kamailio markers.
# Writes: /tmp/mode-b-verify-<timestamp>/
#
# Phone prep (web UI):
#   Maintenance → System Diagnosis → Syslog: 172.31.39.116:514, DEBUG, Send SIP Log=Yes
#   Reboot; wait for Line 1 REGISTER
#   Optional Test 1: verify DND OFF on LCD before dial (record in operator-notes.txt)
#
# Usage (EC2 Instance Connect):
#   cd /opt/vsp-phone-v4/rc1-evidence
#   export PHONE_IP=122.177.247.143
#   export DIAL=13174492106
#   export SEC=180
#   chmod +x mode-b-verify.sh
#   ./mode-b-verify.sh
#
# During capture: Line 1 → dial ${DIAL} → press # within 2 seconds → wait for UI result
#
# Output files:
#   STAGE-TABLE.txt  decision-tree.txt  summary.txt  syslog.txt  all-sip.pcap
set -euo pipefail

PHONE_IP="${PHONE_IP:-122.177.247.143}"
DIAL="${DIAL:-13174492106}"
EXT="${EXT:-100}"
SEC="${SEC:-180}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/tmp/mode-b-verify-${STAMP}"

IFACE="$(ip route get "$PHONE_IP" 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')"
IFACE="${IFACE:-any}"

mkdir -p "$OUT"
PCAP="$OUT/all-sip.pcap"
SYSLOG="$OUT/syslog.txt"
KAMLOG="$OUT/kamailio.log"
SUMMARY="$OUT/summary.txt"
TREE="$OUT/decision-tree.txt"
TABLE="$OUT/STAGE-TABLE.txt"

log() { echo "[mode-b-verify] $*"; }

pcap_invite_count() {
  local n
  n=$(sudo tcpdump -nn -r "$PCAP" -A -s0 2>/dev/null | grep -c '^INVITE sip:' || true)
  echo "${n:-0}"
}

pcap_register_count() {
  local n
  n=$(sudo tcpdump -nn -r "$PCAP" -A -s0 2>/dev/null | grep -c '^REGISTER sip:' || true)
  echo "${n:-0}"
}

syslog_hits() {
  grep -iE "$1" "$SYSLOG" 2>/dev/null | head -"${2:-15}" || true
}

cat <<EOF | tee "$OUT/README.txt"
Mode B verify — $(date -u +%Y-%m-%dT%H:%M:%SZ)
OUT=$OUT
PHONE_IP=$PHONE_IP  DIAL=$DIAL  EXT=$EXT  SEC=${SEC}s  IFACE=$IFACE

Phone before capture:
  Syslog → 172.31.39.116:514  DEBUG  Send SIP Log=Yes  (reboot after change)
  Line 1 registered (green LED)
  Dial ${DIAL} then press # within 2 seconds during capture

Optional operator notes (create before run):
  echo 'dnd_lcd_icon=yes|no' >> $OUT/operator-notes.txt
  echo 'dnd_web_ui=on|off' >> $OUT/operator-notes.txt
EOF

log "Starting ${SEC}s capture → $OUT"
log "Dial ${DIAL} + # when you see: >>> DIAL NOW"

sudo timeout "$SEC" tcpdump -i "$IFACE" -nn -tttt -s0 -w "$PCAP" \
  "host ${PHONE_IP}" 2>"$OUT/tcpdump-phone.err" &
PCAP_PID=$!

sudo timeout "$SEC" tcpdump -i any -nn -A -s0 "udp port 514" >"$SYSLOG" 2>"$OUT/tcpdump-syslog.err" &
SYS_PID=$!

(
  timeout "$SEC" docker logs -f vsp-kamailio 2>&1 \
    | grep -iE "RC1_DESK_INVITE|RC1_REG_|INVITE|${PHONE_IP}|from_user=${EXT}|auth_user=${EXT}" \
    || true
) >"$KAMLOG" 2>"$OUT/kamailio.err" &
KAM_PID=$!

sleep 3
log ">>> DIAL NOW: Line 1, ${DIAL}, press # within 2s"
sleep "$SEC"

sudo kill "$PCAP_PID" 2>/dev/null || true
kill "$SYS_PID" "$KAM_PID" 2>/dev/null || true
wait "$PCAP_PID" 2>/dev/null || true
sleep 2

# --- summary.txt ---
INV_COUNT=$(pcap_invite_count)
REG_COUNT=$(pcap_register_count)
SYSLOG_BYTES=$(wc -c <"$SYSLOG" 2>/dev/null || echo 0)
PCAP_BYTES=$(stat -c%s "$PCAP" 2>/dev/null || echo 0)
KAM_INV=$(grep -c RC1_DESK_INVITE "$KAMLOG" 2>/dev/null || echo 0)
KAM_INV_PHONE=$(grep RC1_DESK_INVITE "$KAMLOG" 2>/dev/null | grep -c "$PHONE_IP" || echo 0)

{
  echo "mode_b_verify_summary"
  echo "captured_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "out=$OUT"
  echo "phone_ip=$PHONE_IP dial=$DIAL ext=$EXT capture_sec=$SEC iface=$IFACE"
  echo "pcap_bytes=$PCAP_BYTES pcap_file=$PCAP"
  echo "syslog_bytes=$SYSLOG_BYTES syslog_file=$SYSLOG"
  echo "register_count=$REG_COUNT invite_count=$INV_COUNT"
  echo "kamailio_rc1_desk_invite_total=$KAM_INV"
  echo "kamailio_rc1_desk_invite_from_phone_ip=$KAM_INV_PHONE"
  echo
  echo "--- SIP methods from ${PHONE_IP} (all ports, UDP+TCP) ---"
  sudo tcpdump -nn -r "$PCAP" -A -s0 2>/dev/null \
    | grep -E '^(INVITE|REGISTER|ACK|BYE|CANCEL|OPTIONS|SIP/2\.0)' | head -40 || true
  echo
  echo "--- Non-REGISTER packets from ${PHONE_IP} ---"
  sudo tcpdump -nn -r "$PCAP" 2>/dev/null | grep "$PHONE_IP" | grep -vi REGISTER | head -40 || true
  echo
  echo "--- TCP flows involving ${PHONE_IP} ---"
  sudo tcpdump -nn -r "$PCAP" 2>/dev/null | grep "$PHONE_IP" | grep -i tcp | head -30 || true
  echo
  echo "--- INVITE lines (if any) ---"
  sudo tcpdump -nn -r "$PCAP" 2>/dev/null | grep -i invite | head -20 || echo "(none)"
  echo
  echo "--- Kamailio tail (phone-related) ---"
  grep -E "${PHONE_IP}|RC1_DESK_INVITE|from_user=${EXT}" "$KAMLOG" 2>/dev/null | tail -20 || true
  echo
  echo "--- Syslog FSM hits (sample) ---"
  syslog_hits 'line|account|Account1|seize|CS_|idle|off.?hook|dial|digit|pound|#|send|dial plan|DialPlan|INVITE|fail|error|abort|DND|dnd|timeout' 40
} | tee "$SUMMARY"

# --- decision-tree.txt ---
SYSLOG_OK=FAIL
[[ "$SYSLOG_BYTES" -gt 500 ]] && SYSLOG_OK=PASS

{
  echo "Mode B decision tree"
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "OUT=$OUT"
  echo

  echo "User presses #"
  if grep -qiE 'pound|#|send key|keyAsSend|send.*dial' "$SYSLOG" 2>/dev/null; then
    echo "  → PASS (syslog)"
    syslog_hits 'pound|#|send key|keyAsSend|send.*dial' 5
  else
    echo "  → NOT PROVEN (no matching syslog line; operator must confirm # within 2s)"
  fi
  echo

  echo "Phone accepts digits?"
  if grep -qiE 'digit|dial string|dialing|CS_DIAL' "$SYSLOG" 2>/dev/null; then
    echo "  → PASS (syslog)"
    syslog_hits 'digit|dial string|dialing|CS_DIAL' 8
  else
    echo "  → NOT PROVEN (no digit lines in syslog; check syslog_bytes=$SYSLOG_BYTES)"
  fi
  echo

  echo "Dial plan passes?"
  if grep -qiE 'dial plan.*reject|no match|DialPlan.*fail|digit map.*fail' "$SYSLOG" 2>/dev/null; then
    echo "  → FAIL (syslog reject)"
    syslog_hits 'dial plan|digit map|reject|no match' 10
  elif grep -qiE 'dial plan|DialPlan|digit map' "$SYSLOG" 2>/dev/null; then
    echo "  → PASS (syslog activity, no reject line)"
    syslog_hits 'dial plan|DialPlan|digit map' 8
  else
    echo "  → NOT PROVEN (no dial-plan lines in syslog)"
  fi
  echo

  echo "INVITE built?"
  if grep -qiE 'create.*invite|build.*invite|INVITE.*create|make.*invite' "$SYSLOG" 2>/dev/null; then
    echo "  → PASS (syslog)"
    syslog_hits 'create.*invite|build.*invite|INVITE' 8
  elif [[ "$INV_COUNT" -gt 0 ]]; then
    echo "  → PASS (pcap contains INVITE request-line)"
  else
    echo "  → FAIL or UNKNOWN (invite_count=$INV_COUNT; no INVITE build line in syslog)"
  fi
  echo

  echo "INVITE transmitted?"
  if [[ "$INV_COUNT" -gt 0 ]]; then
    echo "  → PASS (pcap invite_count=$INV_COUNT from ${PHONE_IP})"
    sudo tcpdump -nn -r "$PCAP" 2>/dev/null | grep -i invite | head -10
  else
    echo "  → FAIL (pcap invite_count=0; only REGISTER or non-SIP from ${PHONE_IP})"
  fi
  echo

  echo "Destination IP:port"
  if [[ "$INV_COUNT" -gt 0 ]]; then
    sudo tcpdump -nn -r "$PCAP" 2>/dev/null | grep -i invite | head -5
  else
    echo "  → N/A (no INVITE datagram)"
  fi
  echo

  echo "Kamailio receives INVITE from ${PHONE_IP}?"
  if [[ "$KAM_INV_PHONE" -gt 0 ]]; then
    echo "  → PASS (kamailio.log RC1_DESK_INVITE count=$KAM_INV_PHONE)"
    grep RC1_DESK_INVITE "$KAMLOG" | grep "$PHONE_IP" | tail -5
  else
    echo "  → FAIL (no RC1_DESK_INVITE with src=${PHONE_IP})"
  fi
  echo

  echo "DEBUG syslog reached EC2: $SYSLOG_OK (${SYSLOG_BYTES} bytes)"
  echo
  echo "Stop point: first NO/FAIL/NOT PROVEN above (bottom-up in tree)"
} | tee "$TREE"

# --- STAGE-TABLE.txt ---
stage() {
  printf "%-22s %-12s %s\n" "$1" "$2" "$3"
}

{
  echo "Mode B stage table"
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "OUT=$OUT"
  echo
  stage "Stage" "PASS/FAIL" "Evidence"
  stage "-----" "--------" "--------"

  if grep -qiE 'line 1|account 1|Account1|seize|line.*select' "$SYSLOG" 2>/dev/null; then
    line_ev=$(grep -iE 'line 1|account 1|Account1|seize' "$SYSLOG" | head -1 | cut -c1-100)
    stage "Line selected" "PASS" "syslog: ${line_ev}"
  elif [[ -f "$OUT/operator-notes.txt" ]] && grep -qi 'line.*1' "$OUT/operator-notes.txt" 2>/dev/null; then
    stage "Line selected" "PASS" "operator-notes.txt"
  else
    stage "Line selected" "NOT PROVEN" "no syslog line/account line; record Line 1 in operator-notes.txt"
  fi

  if [[ -f "$OUT/operator-notes.txt" ]]; then
    if grep -qiE 'dnd.*icon.*yes|dnd_lcd.*yes|dnd_web.*on' "$OUT/operator-notes.txt" 2>/dev/null; then
      stage "DND check" "ACTIVE" "operator-notes.txt (LCD/web UI)"
    else
      stage "DND check" "OFF" "operator-notes.txt"
    fi
  else
    stage "DND check" "NOT TESTED" "no operator-notes.txt; export had call.dnd enable=Yes — verify LCD"
  fi

  if grep -qiE 'digit|dial string|dialing|CS_DIAL' "$SYSLOG" 2>/dev/null; then
    ev=$(grep -iE 'digit|dial string|dialing' "$SYSLOG" | head -1 | cut -c1-100)
    stage "Digit collection" "PASS" "syslog: ${ev}"
  else
    stage "Digit collection" "NOT PROVEN" "syslog_bytes=${SYSLOG_BYTES}; no digit lines"
  fi

  if grep -qiE 'pound|#|send key|keyAsSend|send.*dial' "$SYSLOG" 2>/dev/null; then
    ev=$(grep -iE 'pound|send key|keyAsSend' "$SYSLOG" | head -1 | cut -c1-100)
    stage "# send" "PASS" "syslog: ${ev}"
  else
    stage "# send" "NOT PROVEN" "no #/send syslog line; operator must press # within 2s"
  fi

  if grep -qiE 'dial plan.*reject|no match|DialPlan.*fail' "$SYSLOG" 2>/dev/null; then
    stage "Dial plan" "FAIL" "syslog: dial plan reject"
  elif grep -qiE 'dial plan|DialPlan' "$SYSLOG" 2>/dev/null; then
    stage "Dial plan" "PASS" "syslog: dial plan activity, no reject"
  else
    stage "Dial plan" "NOT PROVEN" "no dial-plan syslog lines"
  fi

  if grep -qiE 'create.*invite|build.*invite|INVITE.*create' "$SYSLOG" 2>/dev/null; then
    stage "INVITE created" "PASS" "syslog: INVITE build"
  elif [[ "$INV_COUNT" -gt 0 ]]; then
    stage "INVITE created" "PASS" "pcap: INVITE request-line present"
  else
    stage "INVITE created" "FAIL/UNKNOWN" "invite_count=0; no build line in syslog"
  fi

  if [[ "$INV_COUNT" -gt 0 ]]; then
    stage "INVITE transmitted" "PASS" "pcap: invite_count=${INV_COUNT} from ${PHONE_IP}"
  else
    stage "INVITE transmitted" "FAIL" "all-sip.pcap: invite_count=0"
  fi

  if [[ "$INV_COUNT" -gt 0 ]]; then
    dest=$(sudo tcpdump -nn -r "$PCAP" 2>/dev/null | grep -i invite | head -1 | cut -c1-120)
    stage "Destination IP" "PASS" "pcap: ${dest}"
  else
    stage "Destination IP" "N/A" "no INVITE datagram"
  fi

  if [[ "$KAM_INV_PHONE" -gt 0 ]]; then
    stage "Kamailio receives" "PASS" "kamailio.log RC1_DESK_INVITE src=${PHONE_IP}"
  else
    stage "Kamailio receives" "FAIL" "kamailio.log: no RC1_DESK_INVITE from ${PHONE_IP}"
  fi

  echo
  echo "Artifacts:"
  echo "  $TABLE"
  echo "  $TREE"
  echo "  $SUMMARY"
  echo "  $SYSLOG"
  echo "  $PCAP"
  echo
  echo "Root cause: NOT DECLARED in this script — interpret STAGE-TABLE + decision-tree only"
} | tee "$TABLE"

log "Done."
log "cat $TABLE"
log "cat $TREE"
log "ls -la $OUT"
