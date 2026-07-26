#!/usr/bin/env bash
# Mode B verification — Grandstream never sends INVITE to Kamailio
#
# Captures ALL traffic from PHONE_IP (UDP + TCP, every port), syslog :514, Kamailio markers.
# Writes: /tmp/mode-b-verify-<timestamp>/
#
# Phone prep (web UI) — MUST use EC2 PUBLIC IP, not 172.31.x.x:
#   Maintenance → System Diagnosis → Syslog:
#     Server: <EC2-public-IP>  e.g. 32.196.41.160
#     Port: 514  Protocol: UDP
#     Level: DEBUG  Send SIP Log: Yes
#   Reboot; wait for Line 1 REGISTER
#   Security group: allow UDP/514 from PHONE_IP
#
# Preflight: ./grandstream-syslog-check.sh --listen 30
#
# Usage:
#   cd /opt/vsp-phone-v4/rc1-evidence
#   export PHONE_IP=122.177.247.143
#   export DIAL=13174492106
#   export SEC=180
#   ./mode-b-verify.sh
#
# Output: STAGE-TABLE.txt decision-tree.txt summary.txt syslog.txt all-sip.pcap
set -euo pipefail

PHONE_IP="${PHONE_IP:-122.177.247.143}"
DIAL="${DIAL:-13174492106}"
EXT="${EXT:-100}"
SEC="${SEC:-180}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/tmp/mode-b-verify-${STAMP}"

IFACE="$(ip route get "$PHONE_IP" 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')"
IFACE="${IFACE:-any}"
PUB_IP="$(curl -sf --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
PRIV_IP="$(curl -sf --max-time 2 http://169.254.169.254/latest/meta-data/local-ipv4 2>/dev/null || true)"

mkdir -p "$OUT"
PCAP="$OUT/all-sip.pcap"
SYSLOG="$OUT/syslog.txt"
KAMLOG="$OUT/kamailio.log"
SUMMARY="$OUT/summary.txt"
TREE="$OUT/decision-tree.txt"
TABLE="$OUT/STAGE-TABLE.txt"
PREFLIGHT="$OUT/syslog-preflight.txt"

log() { echo "[mode-b-verify] $*"; }

# grep -c exits 1 on zero matches but still prints "0" — never use "|| echo 0" (yields "0\n0")
count_in_file() {
  local pattern="$1" file="$2"
  local n
  n=$(grep -c "$pattern" "$file" 2>/dev/null || true)
  echo "${n:-0}"
}

count_in_file_pipe() {
  local p1="$1" file="$2" p2="$3"
  local n
  n=$(grep "$p1" "$file" 2>/dev/null | grep -c "$p2" || true)
  echo "${n:-0}"
}

pcap_invite_count() {
  local n
  n=$(sudo tcpdump -nn -r "$PCAP" 2>/dev/null | grep -c "${PHONE_IP}.*>.*5060.*INVITE" || true)
  echo "${n:-0}"
}

pcap_register_count() {
  local n
  n=$(sudo tcpdump -nn -r "$PCAP" -A -s0 2>/dev/null | grep -c 'REGISTER sip:' || true)
  echo "${n:-0}"
}

pcap_syslog_from_phone() {
  local n
  n=$(sudo tcpdump -nn -r "$PCAP" 2>/dev/null | grep "$PHONE_IP" | grep -c '\.514:' || true)
  echo "${n:-0}"
}

syslog_hits() {
  grep -iE "$1" "$SYSLOG" 2>/dev/null | head -"${2:-15}" || true
}

# --- syslog preflight (embedded) ---
{
  echo "syslog_preflight utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "ec2_public_ip=${PUB_IP:-unknown}"
  echo "ec2_private_ip=${PRIV_IP:-unknown}"
  echo "phone_ip=$PHONE_IP"
  echo
  echo "If phone syslog server is ${PRIV_IP} or 172.31.x.x → UNREACHABLE from public phone."
  echo "Set phone to: ${PUB_IP:-EC2-public-IP}:514 UDP DEBUG SendSIP=Yes"
  echo "Open security group: UDP 514 from ${PHONE_IP}/32"
  echo
  if command -v ss >/dev/null 2>&1; then
    echo "--- ss UDP 514 ---"
    ss -ulnp 2>/dev/null | grep -E ':514\b' || echo "(none bound)"
  fi
  echo "--- run full check: ./grandstream-syslog-check.sh --listen 30 ---"
} | tee "$PREFLIGHT"

cat <<EOF | tee "$OUT/README.txt"
Mode B verify — $(date -u +%Y-%m-%dT%H:%M:%SZ)
OUT=$OUT
PHONE_IP=$PHONE_IP  DIAL=$DIAL  EXT=$EXT  SEC=${SEC}s  IFACE=$IFACE

Phone syslog (required before capture):
  Server: ${PUB_IP:-32.196.41.160}  Port: 514  UDP
  Level: DEBUG  Send SIP Log: Yes
  NOT 172.31.39.116 (private — phone on public internet cannot reach it)
  Reboot after save. SG: UDP/514 from ${PHONE_IP}

During capture (${SEC}s):
  Line 1 → dial ${DIAL} → press # within 2 seconds
EOF

log "Starting ${SEC}s capture → $OUT"
log "Dial ${DIAL} + # when you see: >>> DIAL NOW"

sudo timeout "$SEC" tcpdump -i "$IFACE" -nn -tttt -s0 -w "$PCAP" \
  "host ${PHONE_IP}" 2>"$OUT/tcpdump-phone.err" &
PCAP_PID=$!

# Capture all UDP/514 (any source) — phone syslog should appear here when configured correctly
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

INV_COUNT=$(pcap_invite_count)
REG_COUNT=$(pcap_register_count)
SYSLOG_PKTS_PHONE=$(pcap_syslog_from_phone)
SYSLOG_BYTES=$(wc -c <"$SYSLOG" 2>/dev/null | tr -d ' ')
SYSLOG_BYTES=${SYSLOG_BYTES:-0}
PCAP_BYTES=$(stat -c%s "$PCAP" 2>/dev/null || echo 0)
KAM_INV=$(count_in_file RC1_DESK_INVITE "$KAMLOG")
KAM_INV_PHONE=$(count_in_file_pipe RC1_DESK_INVITE "$KAMLOG" "$PHONE_IP")

{
  echo "mode_b_verify_summary"
  echo "captured_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "out=$OUT"
  echo "phone_ip=$PHONE_IP dial=$DIAL ext=$EXT capture_sec=$SEC iface=$IFACE"
  echo "ec2_public_ip=${PUB_IP:-unknown} ec2_private_ip=${PRIV_IP:-unknown}"
  echo "pcap_bytes=$PCAP_BYTES pcap_file=$PCAP"
  echo "syslog_bytes=$SYSLOG_BYTES syslog_file=$SYSLOG"
  echo "syslog_udp514_packets_from_phone_in_pcap=$SYSLOG_PKTS_PHONE"
  echo "register_count=$REG_COUNT invite_count=$INV_COUNT"
  echo "kamailio_rc1_desk_invite_total=$KAM_INV"
  echo "kamailio_rc1_desk_invite_from_phone_ip=$KAM_INV_PHONE"
  echo
  if [[ "$SYSLOG_BYTES" -le 10 ]]; then
    echo "!!! SYSLOG EMPTY — fix before root-cause analysis:"
    echo "  1. Phone syslog server = EC2 PUBLIC IP (${PUB_IP:-?}), not 172.31.39.116"
    echo "  2. AWS SG inbound UDP 514 from ${PHONE_IP}"
    echo "  3. Phone: DEBUG + Send SIP Log Yes + reboot"
    echo "  4. Run: ./grandstream-syslog-check.sh --listen 30"
    echo
  fi
  echo "--- SIP methods from ${PHONE_IP} (all ports, UDP+TCP) ---"
  sudo tcpdump -nn -r "$PCAP" -A -s0 2>/dev/null \
    | grep -E '(INVITE|REGISTER|ACK|BYE|CANCEL|OPTIONS) sip:|^SIP/2\.0' | head -40 || true
  echo
  echo "--- UDP/514 from ${PHONE_IP} (in all-sip.pcap) ---"
  sudo tcpdump -nn -r "$PCAP" 2>/dev/null | grep "$PHONE_IP" | grep '\.514:' | head -20 \
    || echo "(none — phone not sending syslog to this host)"
  echo
  echo "--- Non-REGISTER packets from ${PHONE_IP} (sample) ---"
  sudo tcpdump -nn -r "$PCAP" 2>/dev/null | grep "$PHONE_IP" | grep -vi REGISTER | head -25 || true
  echo
  echo "--- INVITE lines (if any) ---"
  sudo tcpdump -nn -r "$PCAP" 2>/dev/null | grep -i invite | head -20 || echo "(none)"
  echo
  echo "--- Kamailio tail (phone-related) ---"
  grep -E "${PHONE_IP}|RC1_DESK_INVITE|from_user=${EXT}" "$KAMLOG" 2>/dev/null | tail -15 || true
  echo
  echo "--- Syslog FSM hits (sample) ---"
  syslog_hits 'line|account|Account1|seize|CS_|idle|off.?hook|dial|digit|pound|send|dial plan|DialPlan|INVITE|fail|error|abort|DND|dnd|timeout' 40
} | tee "$SUMMARY"

SYSLOG_OK=FAIL
[[ "$SYSLOG_BYTES" -gt 500 ]] && SYSLOG_OK=PASS

{
  echo "Mode B decision tree"
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "OUT=$OUT"
  echo

  echo "Syslog diagnostics"
  echo "  syslog_bytes=$SYSLOG_BYTES syslog_ok=$SYSLOG_OK"
  echo "  udp514_from_phone_in_pcap=$SYSLOG_PKTS_PHONE"
  echo "  phone must target ec2_public=${PUB_IP:-?} not private ${PRIV_IP:-?}"
  echo

  echo "User presses #"
  if grep -qiE 'pound|send key|keyAsSend|send.*dial' "$SYSLOG" 2>/dev/null; then
    echo "  → PASS (syslog)"
    syslog_hits 'pound|send key|keyAsSend|send.*dial' 5
  else
    echo "  → NOT PROVEN (syslog_bytes=$SYSLOG_BYTES)"
  fi
  echo

  echo "Phone accepts digits?"
  if grep -qiE 'digit|dial string|dialing|CS_DIAL' "$SYSLOG" 2>/dev/null; then
    echo "  → PASS (syslog)"
    syslog_hits 'digit|dial string|dialing|CS_DIAL' 8
  else
    echo "  → NOT PROVEN (syslog_bytes=$SYSLOG_BYTES)"
  fi
  echo

  echo "Dial plan passes?"
  if grep -qiE 'dial plan.*reject|no match|DialPlan.*fail|digit map.*fail' "$SYSLOG" 2>/dev/null; then
    echo "  → FAIL (syslog reject)"
  elif grep -qiE 'dial plan|DialPlan|digit map' "$SYSLOG" 2>/dev/null; then
    echo "  → PASS (syslog, no reject)"
  else
    echo "  → NOT PROVEN (no syslog)"
  fi
  echo

  echo "INVITE built?"
  if grep -qiE 'create.*invite|build.*invite|INVITE.*create|make.*invite' "$SYSLOG" 2>/dev/null; then
    echo "  → PASS (syslog)"
  elif [[ "$INV_COUNT" -gt 0 ]]; then
    echo "  → PASS (pcap INVITE present)"
  else
    echo "  → FAIL/UNKNOWN (invite_count=$INV_COUNT)"
  fi
  echo

  echo "INVITE transmitted?"
  if [[ "$INV_COUNT" -gt 0 ]]; then
    echo "  → PASS (invite_count=$INV_COUNT)"
  else
    echo "  → FAIL (invite_count=0)"
  fi
  echo

  echo "Kamailio receives INVITE from ${PHONE_IP}?"
  if [[ "$KAM_INV_PHONE" -gt 0 ]]; then
    echo "  → PASS (count=$KAM_INV_PHONE)"
  else
    echo "  → FAIL (count=$KAM_INV_PHONE)"
  fi
  echo

  echo "DEBUG syslog reached EC2: $SYSLOG_OK ($SYSLOG_BYTES bytes)"
} | tee "$TREE"

stage() { printf "%-22s %-12s %s\n" "$1" "$2" "$3"; }

{
  echo "Mode B stage table"
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "OUT=$OUT"
  echo
  stage "Stage" "PASS/FAIL" "Evidence"
  stage "-----" "--------" "--------"

  stage "Syslog to EC2" "$SYSLOG_OK" "syslog_bytes=$SYSLOG_BYTES udp514_phone_pkts=$SYSLOG_PKTS_PHONE"

  if grep -qiE 'line 1|account 1|Account1|seize' "$SYSLOG" 2>/dev/null; then
    ev=$(grep -iE 'line 1|account 1|Account1|seize' "$SYSLOG" | head -1 | cut -c1-90)
    stage "Line selected" "PASS" "syslog: $ev"
  else
    stage "Line selected" "NOT PROVEN" "syslog_bytes=$SYSLOG_BYTES"
  fi

  if [[ -f "$OUT/operator-notes.txt" ]]; then
    stage "DND check" "see notes" "operator-notes.txt"
  else
    stage "DND check" "NOT TESTED" "record LCD state in operator-notes.txt"
  fi

  if grep -qiE 'digit|dial string|dialing' "$SYSLOG" 2>/dev/null; then
    stage "Digit collection" "PASS" "syslog"
  else
    stage "Digit collection" "NOT PROVEN" "syslog_bytes=$SYSLOG_BYTES"
  fi

  if grep -qiE 'pound|send key|keyAsSend' "$SYSLOG" 2>/dev/null; then
    stage "# send" "PASS" "syslog"
  else
    stage "# send" "NOT PROVEN" "syslog_bytes=$SYSLOG_BYTES"
  fi

  if grep -qiE 'dial plan.*reject|no match' "$SYSLOG" 2>/dev/null; then
    stage "Dial plan" "FAIL" "syslog reject"
  elif grep -qiE 'dial plan|DialPlan' "$SYSLOG" 2>/dev/null; then
    stage "Dial plan" "PASS" "syslog"
  else
    stage "Dial plan" "NOT PROVEN" "syslog_bytes=$SYSLOG_BYTES"
  fi

  if [[ "$INV_COUNT" -gt 0 ]]; then
    stage "INVITE created" "PASS" "pcap"
    stage "INVITE transmitted" "PASS" "invite_count=$INV_COUNT"
    dest=$(sudo tcpdump -nn -r "$PCAP" 2>/dev/null | grep -i invite | head -1 | cut -c1-100)
    stage "Destination IP" "PASS" "$dest"
  else
    stage "INVITE created" "FAIL/UNKNOWN" "invite_count=0"
    stage "INVITE transmitted" "FAIL" "all-sip.pcap"
    stage "Destination IP" "N/A" "no INVITE"
  fi

  if [[ "$KAM_INV_PHONE" -gt 0 ]]; then
    stage "Kamailio receives" "PASS" "RC1_DESK_INVITE count=$KAM_INV_PHONE"
  else
    stage "Kamailio receives" "FAIL" "count=$KAM_INV_PHONE"
  fi

  echo
  echo "If Syslog to EC2 = FAIL: fix phone IP + SG before interpreting other stages."
} | tee "$TABLE"

log "Done. OUT=$OUT"
log "If syslog_bytes<=10: ./grandstream-syslog-check.sh --listen 30"
