#!/bin/bash
set -uo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
echo "keylen=${#K}"

echo "=== GET /v2/credential_connections ==="
curl -sS -o /tmp/tc1.json -w 'STATUS=%{http_code}\n' -H "Authorization: Bearer ${K}" https://api.telnyx.com/v2/credential_connections
cat /tmp/tc1.json
echo

echo "=== GET /v2/sip_trunks (fallback) ==="
curl -sS -o /tmp/tc2.json -w 'STATUS=%{http_code}\n' -H "Authorization: Bearer ${K}" https://api.telnyx.com/v2/sip_trunks
cat /tmp/tc2.json
echo

echo "=== GET /v2/outbound_voice_profiles ==="
curl -sS -o /tmp/tc3.json -w 'STATUS=%{http_code}\n' -H "Authorization: Bearer ${K}" https://api.telnyx.com/v2/outbound_voice_profiles
cat /tmp/tc3.json
echo

echo "=== GET /v2/phone_numbers (first page) ==="
curl -sS -o /tmp/tc4.json -w 'STATUS=%{http_code}\n' -H "Authorization: Bearer ${K}" "https://api.telnyx.com/v2/phone_numbers?page[size]=20"
cat /tmp/tc4.json
echo
