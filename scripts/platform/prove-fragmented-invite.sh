#!/usr/bin/env bash
# Prove whether fragmented UDP INVITEs from the desk phone reach Kamailio.
# Usage (on EC2):
#   cd /opt/vsp-phone-v4 && source scripts/platform/ec2-compose-env.sh
#   sudo bash scripts/platform/prove-fragmented-invite.sh
# Then dial once from the GRP2601. Ctrl+C when done (or wait TIMEOUT_SEC).
#
# Env:
#   PHONE_IP   default 122.177.247.143
#   TIMEOUT_SEC default 90

set -euo pipefail

PHONE_IP="${PHONE_IP:-122.177.247.143}"
TIMEOUT_SEC="${TIMEOUT_SEC:-90}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/tmp/frag-invite-${STAMP}"
mkdir -p "$OUT"

echo "=== frag-invite proof ${STAMP} ==="
echo "PHONE_IP=${PHONE_IP}"
echo "OUT=${OUT}"

# --- Static topology (answers Q3/Q4 partially without a call) ---
{
  echo "## docker kamailio network"
  docker inspect vsp-kamailio --format \
    'NetworkMode={{.HostConfig.NetworkMode}} Ports={{json .NetworkSettings.Ports}} IP={{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
    2>/dev/null || echo "vsp-kamailio not found"
  echo
  echo "## docker-proxy / userland-proxy listeners on 5060"
  ss -ulnp | grep -E ':5060\b' || true
  ss -tlnp | grep -E ':5060\b' || true
  echo
  echo "## nf_conntrack fragment / UDP knobs"
  sysctl net.netfilter.nf_conntrack_max 2>/dev/null || true
  sysctl net.netfilter.nf_conntrack_udp_timeout 2>/dev/null || true
  sysctl net.netfilter.nf_conntrack_udp_timeout_stream 2>/dev/null || true
  sysctl net.ipv4.ipfrag_high_thresh 2>/dev/null || true
  sysctl net.ipv4.ipfrag_low_thresh 2>/dev/null || true
  sysctl net.ipv4.ipfrag_time 2>/dev/null || true
  echo
  echo "## conntrack counters (before)"
  if [[ -r /proc/net/stat/nf_conntrack ]]; then
    head -2 /proc/net/stat/nf_conntrack || true
  fi
  grep -E 'Frag|Invalid|Drop' /proc/net/snmp 2>/dev/null || true
  grep -E 'FragFails|ReasmFails|ReasmReqds|ReasmOKs|ReasmTimeout' /proc/net/snmp 2>/dev/null || true
  echo
  echo "## existing conntrack for phone (before)"
  if command -v conntrack >/dev/null 2>&1; then
    conntrack -L -s "$PHONE_IP" 2>/dev/null | head -50 || true
    conntrack -L -p udp --dport 5060 2>/dev/null | grep -F "$PHONE_IP" | head -50 || true
  else
    echo "conntrack tool missing — install: sudo apt-get install -y conntrack"
  fi
} | tee "$OUT/topology.txt"

# Resolve host iface facing SIP (default route)
IFACE="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')"
IFACE="${IFACE:-eth0}"
echo "Capture iface: $IFACE" | tee -a "$OUT/topology.txt"

KAMA_IP="$(docker inspect vsp-kamailio --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || true)"
echo "Kamailio container IP: ${KAMA_IP:-unknown}" | tee -a "$OUT/topology.txt"

echo
echo ">>> Dial ONE outbound call from the GRP2601 now (within ${TIMEOUT_SEC}s)."
echo ">>> Capturing host + (if possible) container path..."

# Host capture: all IP traffic from phone to UDP/5060 including non-first fragments
# (fragmented IP packets after first do NOT carry UDP header — filter by host only)
sudo tcpdump -i "$IFACE" -nn -ttttt -s0 -w "$OUT/host.pcap" \
  "host ${PHONE_IP} and (udp port 5060 or (ip[6:2] & 0x1fff) != 0)" \
  >/dev/null 2>"$OUT/host-tcpdump.err" &
HOST_PID=$!

# Optional: capture on docker bridge toward container (if not host network)
BRIDGE_PID=""
if [[ -n "$KAMA_IP" ]]; then
  BR="$(ip route get "$KAMA_IP" 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')"
  if [[ -n "$BR" && "$BR" != "$IFACE" ]]; then
    echo "Also capturing docker path on $BR toward $KAMA_IP" | tee -a "$OUT/topology.txt"
    sudo tcpdump -i "$BR" -nn -ttttt -s0 -w "$OUT/bridge.pcap" \
      "host ${PHONE_IP} or host ${KAMA_IP}" \
      >/dev/null 2>"$OUT/bridge-tcpdump.err" &
    BRIDGE_PID=$!
  fi
fi

# Kamailio logs during window
if [[ -n "${COMPOSE:-}" ]]; then
  $COMPOSE logs -f --since 0s kamailio >"$OUT/kamailio.log" 2>&1 &
  LOG_PID=$!
else
  docker logs -f --since 0s vsp-kamailio >"$OUT/kamailio.log" 2>&1 &
  LOG_PID=$!
fi

cleanup() {
  sudo kill "$HOST_PID" 2>/dev/null || true
  [[ -n "$BRIDGE_PID" ]] && sudo kill "$BRIDGE_PID" 2>/dev/null || true
  kill "$LOG_PID" 2>/dev/null || true
  wait "$HOST_PID" 2>/dev/null || true
  [[ -n "$BRIDGE_PID" ]] && wait "$BRIDGE_PID" 2>/dev/null || true
  wait "$LOG_PID" 2>/dev/null || true
}
trap cleanup EXIT

sleep "$TIMEOUT_SEC"
cleanup
trap - EXIT

echo
echo "=== Analyzing captures ==="

analyze_pcap() {
  local pcap="$1"
  local label="$2"
  [[ -f "$pcap" ]] || { echo "[$label] missing $pcap"; return; }
  local sz
  sz=$(stat -c%s "$pcap" 2>/dev/null || echo 0)
  echo "[$label] $pcap size=$sz"
  if ! command -v tcpdump >/dev/null; then
    echo "[$label] tcpdump missing for readback"
    return
  fi
  # First-fragment / whole UDP SIP methods
  echo "[$label] SIP method lines (first fragment / unfragmented only):"
  sudo tcpdump -nn -r "$pcap" -A -s0 2>/dev/null \
    | grep -E '^(INVITE|REGISTER|ACK|BYE|CANCEL|OPTIONS|SIP/2.0)' \
    | head -40 || true
  echo "[$label] IP fragment summary (MF / offset):"
  # Verbose: look for frag flags in tcpdump -v
  sudo tcpdump -nn -v -r "$pcap" 2>/dev/null \
    | grep -E "frag |${PHONE_IP}" \
    | head -80 || true
  echo "[$label] packet count:"
  sudo tcpdump -nn -r "$pcap" 2>/dev/null | wc -l
}

analyze_pcap "$OUT/host.pcap" "HOST"
[[ -f "$OUT/bridge.pcap" ]] && analyze_pcap "$OUT/bridge.pcap" "BRIDGE"

{
  echo "## SNMP IP reassembly AFTER capture"
  grep -E 'FragFails|ReasmFails|ReasmReqds|ReasmOKs|ReasmTimeout|InHdrErrors' /proc/net/snmp || true
  echo
  echo "## conntrack for phone AFTER"
  if command -v conntrack >/dev/null 2>&1; then
    conntrack -L -s "$PHONE_IP" 2>/dev/null | head -80 || true
    echo "---"
    conntrack -L -p udp --dport 5060 2>/dev/null | grep -F "$PHONE_IP" | head -80 || true
  fi
  echo
  echo "## Kamailio log hits for phone / INVITE / parse"
  grep -E "${PHONE_IP}|INVITE|RC1_DESK|malform|parse|incomplete|bad_|error" "$OUT/kamailio.log" \
    | tail -100 || true
} | tee "$OUT/after.txt"

echo
echo "=== DONE — artifacts in $OUT ==="
ls -la "$OUT"
echo
echo "Interpret:"
echo "  Q1 host both fragments?  look HOST frag lines: offset 0 + non-zero offset same id"
echo "  Q2 Linux reasm?         ReasmReqds/ReasmOKs/ReasmFails delta in after.txt"
echo "  Q3 conntrack drop?      missing/incomplete udp entries for INVITE vs REGISTER"
echo "  Q4 docker bridge?       BRIDGE pcap: INVITE present? NetworkMode=host vs bridge"
echo "  Q5 kamailio malformed?  kamailio.log INVITE/parse lines for ${PHONE_IP}"
