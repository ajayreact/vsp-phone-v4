#!/usr/bin/env bash
# Grandstream GRP2601 root-cause isolation — Experiments 1–5
# Run on EC2 (Instance Connect). Phone changes via web UI only (no platform edits).
#
# Usage:
#   cd /opt/vsp-phone-v4/rc1-evidence
#   export PHONE_IP=122.177.247.143
#   export EXT=100
#   export DIAL=13174492106
#   chmod +x grandstream-root-cause-experiments.sh
#   ./grandstream-root-cause-experiments.sh all
#   ./grandstream-root-cause-experiments.sh exp1|exp2|exp3|exp4|exp5|report
set -euo pipefail

PHONE_IP="${PHONE_IP:-122.177.247.143}"
EXT="${EXT:-100}"
DIAL="${DIAL:-13174492106}"
CAPTURE_SEC="${CAPTURE_SEC:-120}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${OUT:-/tmp/gs-root-cause-${STAMP}}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file /opt/vsp-phone-v4/.env}"

mkdir -p "$OUT"

phone_ui_exp1() {
  cat <<'EOF'
=== Experiment 1 — Phone UI (before capture) ===
Account 1 → Codec / Audio Settings:
  Enable ONLY: PCMU (G.711 μ-law)
  Disable: OPUS, G.722, G.729, G.723, G.726, iLBC
Save → reboot phone if prompted.
EOF
}

phone_ui_exp2() {
  cat <<'EOF'
=== Experiment 2 — Phone UI ===
Account 1 → SIP Settings → Custom SIP Headers (or Advanced):
  Disable: P-Access-Network-Info (PANI)
  Disable: PEI / P-Preferred-Identity extensions if shown
  Disable: X-Grandstream / vendor SIP extensions
Save. Keep Experiment 1 codec settings.
EOF
}

phone_ui_exp3() {
  cat <<'EOF'
=== Experiment 3 — Phone UI ===
Account 1 → SIP Settings → SIP Transport:
  Change UDP → TCP
  Port remains 5060 (or platform TCP port if different)
Save. Reboot recommended after transport change.
EOF
}

phone_ui_exp5() {
  cat <<'EOF'
=== Experiment 5 — Phone UI (Mode B) ===
Maintenance → System Diagnosis → Syslog:
  Syslog Server: <EC2 public IP>:514  (or 172.31.39.116:514 from LAN test)
  Syslog Level: DEBUG
  Send SIP Log: Yes
Reboot phone. Wait 120s after REGISTER. Dial <DIAL> then press # (key-as-send=Pound).
EOF
}

start_capture() {
  local tag="$1"
  local dir="$OUT/$tag"
  mkdir -p "$dir"
  IFACE="$(ip route get "$PHONE_IP" 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')"
  IFACE="${IFACE:-any}"
  echo "Capture $tag on $IFACE for ${CAPTURE_SEC}s → $dir"
  sudo timeout "$CAPTURE_SEC" tcpdump -i "$IFACE" -nn -tttt -s0 -w "$dir/phone.pcap" \
    "host $PHONE_IP and (udp port 5060 or tcp port 5060 or (ip[6:2] & 0x1fff) != 0)" \
    2>"$dir/tcpdump.err" &
  echo $! >"$dir/capture.pid"
  (
    timeout "$CAPTURE_SEC" docker logs -f vsp-kamailio 2>&1 \
      | grep -iE "RC1_REG_|RC1_DESK_INVITE|INVITE|${PHONE_IP}|from_user=${EXT}|auth_user=${EXT}" \
      || true
  ) >"$dir/kamailio.log" &
  echo $! >"$dir/kamlog.pid"
  echo ">>> Dial $DIAL from Grandstream NOW (${CAPTURE_SEC}s window)"
}

stop_capture() {
  local tag="$1"
  local dir="$OUT/$tag"
  [[ -f "$dir/capture.pid" ]] && sudo kill "$(cat "$dir/capture.pid")" 2>/dev/null || true
  [[ -f "$dir/kamlog.pid" ]] && kill "$(cat "$dir/kamlog.pid")" 2>/dev/null || true
  sleep 1
}

analyze_capture() {
  local tag="$1"
  local dir="$OUT/$tag"
  local pcap="$dir/phone.pcap"
  local summary="$dir/summary.txt"
  {
    echo "experiment=$tag"
    echo "captured_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "phone_ip=$PHONE_IP dial=$DIAL"
    if [[ ! -f "$pcap" ]]; then
      echo "pcap=MISSING"
      exit 0
    fi
    echo "pcap_bytes=$(stat -c%s "$pcap" 2>/dev/null || echo 0)"
    echo "--- SIP methods (first fragment / unfragmented) ---"
    sudo tcpdump -nn -r "$pcap" -A -s0 2>/dev/null \
      | grep -E '^(INVITE|REGISTER|ACK|BYE|CANCEL|SIP/2\.0 [0-9])' | head -30 || true
    echo "--- INVITE lines ---"
    sudo tcpdump -nn -r "$pcap" -A -s0 2>/dev/null | grep -E '^INVITE |^Content-Length:|^User-Agent:|^Via:|^Contact:|^Route:' | head -40 || true
    echo "--- IP fragmentation ---"
    sudo tcpdump -nn -v -r "$pcap" 2>/dev/null | grep -E "frag |$PHONE_IP.*5060" | head -40 || true
    echo "--- UDP/TCP lengths toward 5060 ---"
    sudo tcpdump -nn -r "$pcap" 2>/dev/null | grep -E "$PHONE_IP.*5060|5060.*$PHONE_IP" | head -20 || true
    echo "--- Kamailio desk INVITE? ---"
    grep -c RC1_DESK_INVITE "$dir/kamailio.log" 2>/dev/null || echo 0
    grep RC1_DESK_INVITE "$dir/kamailio.log" 2>/dev/null | tail -5 || true
  } | tee "$summary"
}

run_exp1() {
  phone_ui_exp1 | tee "$OUT/exp1-phone-steps.txt"
  start_capture exp1
  sleep "$CAPTURE_SEC"
  stop_capture exp1
  analyze_capture exp1
}

run_exp2() {
  phone_ui_exp2 | tee "$OUT/exp2-phone-steps.txt"
  start_capture exp2
  sleep "$CAPTURE_SEC"
  stop_capture exp2
  analyze_capture exp2
}

run_exp3() {
  phone_ui_exp3 | tee "$OUT/exp3-phone-steps.txt"
  start_capture exp3
  sleep "$CAPTURE_SEC"
  stop_capture exp3
  analyze_capture exp3
}

run_exp4() {
  cat <<EOF | tee "$OUT/exp4-phone-steps.txt"
=== Experiment 4 — Wireshark comparison ===
1) Zoiper: place one outbound call to $DIAL (same ext $EXT).
2) Grandstream: restore factory codec/header settings OR use current config; place one call to $DIAL.
3) Copy pcaps to $OUT/exp4-zoiper.pcap and $OUT/exp4-grandstream.pcap
   Or run: tshark -r phone.pcap -Y sip.Method==INVITE -V > $OUT/exp4-grandstream-invite.txt
EOF
  if [[ -f "$OUT/exp4-zoiper.pcap" && -f "$OUT/exp4-grandstream.pcap" ]]; then
    python3 "$(dirname "$0")/experiment4-compare-invites.py" \
      --zoiper "$OUT/exp4-zoiper.pcap" \
      --grandstream "$OUT/exp4-grandstream.pcap" \
      --out "$OUT/exp4-comparison" 2>/dev/null || \
    echo "Install tshark/pyshark or paste INVITE text files for compare"
  else
    echo "Place exp4-zoiper.pcap and exp4-grandstream.pcap in $OUT then re-run exp4"
  fi
}

run_exp5() {
  phone_ui_exp5 | tee "$OUT/exp5-phone-steps.txt"
  echo "Listening for syslog UDP/514 for ${CAPTURE_SEC}s..."
  sudo timeout "$CAPTURE_SEC" tcpdump -i any -nn -A -s0 'udp port 514' >"$OUT/exp5-syslog.pcap.txt" 2>&1 &
  SYS_PID=$!
  start_capture exp5
  sleep "$CAPTURE_SEC"
  stop_capture exp5
  kill "$SYS_PID" 2>/dev/null || true
  analyze_capture exp5
  grep -iE 'INVITE|dial plan|DialPlan|send invite|line|off.hook|#|pound|fail|error|abort' \
    "$OUT/exp5-syslog.pcap.txt" 2>/dev/null | head -80 | tee "$OUT/exp5-syslog-hits.txt" || true
}

write_report() {
  local report="$OUT/ROOT-CAUSE-REPORT.md"
  {
    echo "# Grandstream Root Cause — Experiment Results"
    echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "OUT=$OUT"
    echo
    for e in exp1 exp2 exp3 exp4 exp5; do
      echo "## $e"
      if [[ -f "$OUT/$e/summary.txt" ]]; then
        cat "$OUT/$e/summary.txt"
      elif [[ -f "$OUT/exp4-comparison/comparison.md" ]]; then
        cat "$OUT/exp4-comparison/comparison.md"
      else
        echo "NOT RUN or no summary"
      fi
      echo
    done
  } >"$report"
  echo "Wrote $report"
}

case "${1:-all}" in
  exp1) run_exp1 ;;
  exp2) run_exp2 ;;
  exp3) run_exp3 ;;
  exp4) run_exp4 ;;
  exp5) run_exp5 ;;
  report) write_report ;;
  all)
    run_exp1
    run_exp2
    run_exp3
    run_exp4
    run_exp5
    write_report
    ;;
  *)
    echo "Usage: $0 exp1|exp2|exp3|exp4|exp5|report|all"
    exit 1
    ;;
esac
