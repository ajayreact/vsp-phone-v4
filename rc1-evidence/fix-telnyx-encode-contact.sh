#!/usr/bin/env bash
# Telnyx P01: ACK must target B2BUA Contact; encode_contact_header helps NAT/ALG.
set -euo pipefail
cd /opt/vsp-phone-v4
CONN_ID="${TELNYX_CONNECTION_ID:-2982156817053779933}"
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2- | tr -d $'\r"')

echo "=== Before ==="
curl -sS -H "Authorization: Bearer ${K}" \
  "https://api.telnyx.com/v2/credential_connections/${CONN_ID}" \
  -o /tmp/conn-enc-before.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/conn-enc-before.json')).get('data') or {}
print('encode_contact_header_enabled:', d.get('encode_contact_header_enabled'))
PY

echo "=== PATCH encode_contact_header_enabled=true ==="
HTTP=$(curl -sS -w '%{http_code}' -o /tmp/conn-enc-after.json \
  -X PATCH \
  -H "Authorization: Bearer ${K}" \
  -H "Content-Type: application/json" \
  "https://api.telnyx.com/v2/credential_connections/${CONN_ID}" \
  -d '{"encode_contact_header_enabled":true}')
echo "HTTP ${HTTP}"
python3 - <<'PY'
import json
d=json.load(open('/tmp/conn-enc-after.json')).get('data') or {}
print('encode_contact_header_enabled:', d.get('encode_contact_header_enabled'))
if d.get('encode_contact_header_enabled') is not True:
    raise SystemExit('ERROR: encode_contact_header_enabled not true')
print('OK')
PY
