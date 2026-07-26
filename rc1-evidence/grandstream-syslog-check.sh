#!/usr/bin/env bash
# Grandstream handset syslog preflight — run on EC2 before mode-b-verify.sh
#
# Checks why syslog.txt may be empty (syslog_bytes≈1):
#   - Phone must use EC2 PUBLIC IP, not 172.31.x.x (private VPC — unreachable from internet)
#   - UDP/514 must be open in security group + host firewall
#   - Grandstream: DEBUG level, Send SIP Log=Yes, reboot after change
#
# Usage:
#   cd /opt/vsp-phone-v4/rc1-evidence
#   export PHONE_IP=122.177.247.143
#   chmod +x grandstream-syslog-check.sh
#   ./grandstream-syslog-check.sh
#   ./grandstream-syslog-check.sh --listen 30   # wait 30s for phone packets on :514
set -euo pipefail

PHONE_IP="${PHONE_IP:-122.177.247.143}"
LISTEN_SEC="${1:-0}"
if [[ "${1:-}" == "--listen" ]]; then
  LISTEN_SEC="${2:-30}"
fi

PRIV_IP="$(curl -sf --max-time 2 http://169.254.169.254/latest/meta-data/local-ipv4 2>/dev/null || hostname -I | awk '{print $1}')"
PUB_IP="$(curl -sf --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"

OUT="/tmp/gs-syslog-check-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"
REPORT="$OUT/syslog-preflight.txt"

section() { echo; echo "=== $* ==="; }

{
  section "Identity"
  echo "host=$(hostname) utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "private_ip=${PRIV_IP:-unknown}"
  echo "public_ip=${PUB_IP:-unknown}"
  echo "phone_ip=$PHONE_IP"
  echo
  echo "CRITICAL: Grandstream on public internet must syslog to PUBLIC IP:"
  echo "  Syslog Server = ${PUB_IP:-<EC2-public-IP>}  Port = 514  Protocol = UDP"
  echo "  DO NOT use ${PRIV_IP} — that is VPC-private and unreachable from ${PHONE_IP}"

  section "Phone web UI (verify manually)"
  echo "Maintenance → System Diagnosis → Syslog Server:"
  echo "  Server: ${PUB_IP:-32.196.41.160}  (not 172.31.39.116)"
  echo "  Port: 514"
  echo "  Level: DEBUG"
  echo "  Send SIP Log: Yes"
  echo "Save → Reboot phone → wait REGISTER"

  section "Export baseline (Jul 26 — syslog was OFF)"
  echo "maintain.syslog level=None sendSipLog=No  P20713=0"
  echo "If UI shows DEBUG but export still None, Save+Reboot did not apply."

  section "UDP/514 listener on this host"
  if command -v ss >/dev/null 2>&1; then
    ss -ulnp 2>/dev/null | grep -E ':514\b' || echo "(no process bound to UDP 514 — OK for tcpdump-only capture)"
  else
    sudo netstat -ulnp 2>/dev/null | grep 514 || echo "(no UDP 514 listener)"
  fi

  section "Host firewall (ufw)"
  if command -v ufw >/dev/null 2>&1; then
    sudo ufw status 2>/dev/null | head -20 || true
  else
    echo "ufw not installed"
  fi

  section "iptables INPUT (514)"
  sudo iptables -L INPUT -n -v 2>/dev/null | grep -E '514|policy' | head -15 || echo "(no 514-specific rules or no permission)"

  section "Local UDP/514 inject (self-test tcpdump)"
  sudo timeout 3 tcpdump -i any -nn -c 1 'udp port 514' >/dev/null 2>&1 &
  TP=$!
  sleep 1
  echo "test syslog inject $(date -u +%Y-%m-%dT%H:%M:%SZ)" | nc -u -w1 127.0.0.1 514 2>/dev/null \
    || echo "127.0.0.1 514" | nc -u -w1 127.0.0.1 514 2>/dev/null \
    || true
  wait "$TP" 2>/dev/null || true
  echo "If tcpdump caught local packet, host capture path for :514 works."

  section "Security group (operator — AWS console or CLI)"
  echo "Inbound rule required:"
  echo "  UDP 514 from ${PHONE_IP}/32  (or 0.0.0.0/0 for test only)"
  echo "CLI example (replace sg-xxx):"
  echo "  aws ec2 authorize-security-group-ingress --group-id sg-XXX --protocol udp --port 514 --cidr ${PHONE_IP}/32"

  if [[ "$LISTEN_SEC" -gt 0 ]]; then
    section "Listen ${LISTEN_SEC}s for syslog from ${PHONE_IP} (udp/514)"
    echo "Reboot phone or trigger activity now..."
    CAP="$OUT/phone-syslog.pcap"
    sudo timeout "$LISTEN_SEC" tcpdump -i any -nn -s0 -w "$CAP" \
      "host ${PHONE_IP} and udp port 514" 2>"$OUT/tcpdump.err" || true
    PKTS=$(sudo tcpdump -nn -r "$CAP" 2>/dev/null | wc -l || echo 0)
    echo "packets_captured=$PKTS file=$CAP"
    if [[ "$PKTS" -gt 0 ]]; then
      echo "PASS: phone sent UDP/514 to this host"
      sudo tcpdump -nn -r "$CAP" -A -s0 2>/dev/null | head -30 || true
      SYSLOG_PASS=1
    else
      echo "FAIL: zero UDP/514 from ${PHONE_IP} — wrong syslog IP, SG block, or phone level=None"
      SYSLOG_PASS=0
    fi
  fi

  section "Next step"
  echo "1. Set phone syslog to ${PUB_IP:-EC2-public-IP}:514 DEBUG SendSIP=Yes → reboot"
  echo "2. Open SG UDP/514 from ${PHONE_IP}"
  echo "3. ./grandstream-syslog-check.sh --listen 30"
  echo "4. When listen shows packets: ./mode-b-verify.sh"
  echo
  echo "Report: $REPORT"
} | tee "$REPORT"

echo "[grandstream-syslog-check] Wrote $REPORT"
if [[ "${SYSLOG_PASS:-}" == "1" ]]; then
  exit 0
fi
if [[ "$LISTEN_SEC" -gt 0 ]]; then
  exit 1
fi
