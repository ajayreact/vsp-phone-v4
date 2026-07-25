#!/usr/bin/env bash
# Fix: Telnyx outbound call_parking_enabled parks SIP-trunk INVITEs instead of
# bridging to PSTN. Symptom: A-leg 180, no telnyx_cc_app B-leg, destination never rings.
set -euo pipefail
cd /opt/vsp-phone-v4

CONN_ID="${TELNYX_CONNECTION_ID:-2982156817053779933}"
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)

echo "=== Before ==="
curl -sS -H "Authorization: Bearer ${K}" \
  "https://api.telnyx.com/v2/credential_connections/${CONN_ID}" \
  -o /tmp/conn-before.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/conn-before.json')).get('data') or {}
ob=d.get('outbound') or {}
print('connection_name:', d.get('connection_name'))
print('webhook_event_url:', d.get('webhook_event_url'))
print('outbound.call_parking_enabled:', ob.get('call_parking_enabled'))
print('outbound.instant_ringback_enabled:', ob.get('instant_ringback_enabled'))
PY

echo
echo "=== PATCH call_parking_enabled=false ==="
HTTP=$(curl -sS -w '%{http_code}' -o /tmp/conn-after.json \
  -X PATCH \
  -H "Authorization: Bearer ${K}" \
  -H "Content-Type: application/json" \
  "https://api.telnyx.com/v2/credential_connections/${CONN_ID}" \
  -d '{"outbound":{"call_parking_enabled":false}}')
echo "HTTP ${HTTP}"

echo
echo "=== After ==="
python3 - <<'PY'
import json
d=json.load(open('/tmp/conn-after.json')).get('data') or {}
ob=d.get('outbound') or {}
print('outbound.call_parking_enabled:', ob.get('call_parking_enabled'))
print('outbound.instant_ringback_enabled:', ob.get('instant_ringback_enabled'))
print('outbound.outbound_voice_profile_id:', ob.get('outbound_voice_profile_id'))
if ob.get('call_parking_enabled') is not False:
    raise SystemExit('ERROR: call_parking_enabled still not false')
print('OK: call parking disabled — outbound SIP-trunk INVITEs should auto-bridge to PSTN')
PY
