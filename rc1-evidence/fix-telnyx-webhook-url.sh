#!/usr/bin/env bash
# Fix: Telnyx credential connection webhook_event_url points at /webhook/voice
# which is not implemented for direct Kamailio SIP-trunk bridging. Telnyx Call
# Control POSTs during connected calls, gets 404, and tears down after ~32s
# (call_sec=32 on every CDR). Clear the webhook for pure SIP-trunk mode.
set -euo pipefail
cd /opt/vsp-phone-v4

CONN_ID="${TELNYX_CONNECTION_ID:-2982156817053779933}"
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)

echo "=== Before ==="
curl -sS -H "Authorization: Bearer ${K}" \
  "https://api.telnyx.com/v2/credential_connections/${CONN_ID}" \
  -o /tmp/conn-webhook-before.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/conn-webhook-before.json')).get('data') or {}
print('connection_name:', d.get('connection_name'))
print('webhook_event_url:', d.get('webhook_event_url'))
print('outbound.call_parking_enabled:', (d.get('outbound') or {}).get('call_parking_enabled'))
PY

echo
echo "=== PATCH webhook_event_url=null (SIP-trunk mode — no Call Control webhook) ==="
HTTP=$(curl -sS -w '%{http_code}' -o /tmp/conn-webhook-after.json \
  -X PATCH \
  -H "Authorization: Bearer ${K}" \
  -H "Content-Type: application/json" \
  "https://api.telnyx.com/v2/credential_connections/${CONN_ID}" \
  -d '{"webhook_event_url":null}')
echo "HTTP ${HTTP}"

echo
echo "=== After ==="
python3 - <<'PY'
import json
d=json.load(open('/tmp/conn-webhook-after.json')).get('data') or {}
url=d.get('webhook_event_url')
print('webhook_event_url:', url)
if url not in (None, ''):
    raise SystemExit('ERROR: webhook_event_url still set')
print('OK: webhook cleared — Telnyx should not Call-Control-hangup at ~32s')
PY
