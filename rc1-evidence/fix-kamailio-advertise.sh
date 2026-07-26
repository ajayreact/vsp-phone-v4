#!/usr/bin/env bash
# Fix: Kamailio Record-Route used sip:0.0.0.0 on carrier B2BUA legs because listen
# sockets had no advertise address. Telnyx rejects the broken post-answer ACK and
# drops connected calls after ~32s (call_sec=32, hangup_details=send_bye).
set -euo pipefail
cd /opt/vsp-phone-v4

SIP_PUBLIC_IP="${SIP_PUBLIC_IP:-$(grep -m1 '^SIP_PUBLIC_IP=' .env | cut -d= -f2-)}"
SIP_REGISTRAR_HOST="${SIP_REGISTRAR_HOST:-$(grep -m1 '^SIP_REGISTRAR_HOST=' .env | cut -d= -f2-)}"
RR_ADVERTISE="${SIP_REGISTRAR_HOST:-${SIP_PUBLIC_IP}}"
RR_ADVERTISE="${RR_ADVERTISE#*://}"
RR_ADVERTISE="${RR_ADVERTISE%%/*}"
RR_ADVERTISE="${RR_ADVERTISE%%:*}"

if [ -z "${SIP_PUBLIC_IP}" ] || [ -z "${RR_ADVERTISE}" ]; then
  echo "ERROR: set SIP_PUBLIC_IP and SIP_REGISTRAR_HOST in .env"
  exit 1
fi

echo "=== Restart vsp-kamailio (entrypoint injects listen advertise=${SIP_PUBLIC_IP}) ==="
docker compose restart kamailio

echo "=== Verify runtime cfg ==="
sleep 8
docker exec vsp-kamailio grep -E 'advertise|alias=\"sip\.vspphone' /tmp/kamailio.runtime.cfg | head -10

echo
echo "OK — place a test call and confirm call_sec >> 32:"
echo "  bash rc1-evidence/recent-call-logs.sh | grep call_sec"
