#!/usr/bin/env bash
# Fallback when remote syslog (UDP/514) is unavailable after provisioning fix.
# Uses Grandstream built-in packet capture via web UI — no EC2 syslog required.
#
# Operator steps (phone web UI at http://<phone-ip>):
#   1. Maintenance → Troubleshooting → Packet Capture → Start (filter SIP if offered)
#   2. Place one outbound test call to ${DIAL:-13174492106}
#   3. Stop capture → Download PCAP
#   4. SCP PCAP to EC2 and analyze:
#        tshark -r phone.pcap -Y sip -T fields -e frame.time -e ip.src -e ip.dst -e sip.Method
#
# This script prints the checklist and, if OUT_PCAP is set, analyzes a downloaded file.
set -euo pipefail

DIAL="${DIAL:-13174492106}"
OUT_PCAP="${OUT_PCAP:-}"
PHONE_IP="${PHONE_IP:-122.177.247.143}"

cat <<EOF
=== Grandstream packet-capture fallback (syslog unavailable) ===
Phone: ${PHONE_IP}
Test dial: ${DIAL}

Web UI path:
  Maintenance → Troubleshooting → Packet Capture
  Start → dial ${DIAL} → Stop → Download .pcap

Evidence to collect:
  - INVITE from phone LAN/public IP toward sip.vspphone.com / EC2 :5060  → INVITE transmitted
  - No INVITE in PCAP after digits + Send/#                        → INVITE never created (earlyDial/DND/dial plan)
  - INVITE to wrong IP/port                                        → wrong destination

Upload to EC2:
  scp phone.pcap ec2:/tmp/grandstream-phone.pcap
  OUT_PCAP=/tmp/grandstream-phone.pcap $0
EOF

if [[ -n "$OUT_PCAP" && -f "$OUT_PCAP" ]]; then
  echo "=== analyzing ${OUT_PCAP} ==="
  if command -v tshark >/dev/null 2>&1; then
    INV=$(tshark -r "$OUT_PCAP" -Y 'sip.Method==INVITE' 2>/dev/null | wc -l | tr -d ' ')
    REG=$(tshark -r "$OUT_PCAP" -Y 'sip.Method==REGISTER' 2>/dev/null | wc -l | tr -d ' ')
    echo "register_frames=${REG} invite_frames=${INV}"
    tshark -r "$OUT_PCAP" -Y sip -T fields -e frame.time -e ip.src -e ip.dst -e sip.Method 2>/dev/null | head -40 || true
    if [[ "$INV" == "0" ]]; then
      echo "VERDICT: INVITE never created or not transmitted (handset-side)"
      exit 1
    fi
    echo "VERDICT: INVITE present in phone-local PCAP"
  else
    echo "Install tshark to auto-analyze; PCAP saved at ${OUT_PCAP}"
  fi
fi
