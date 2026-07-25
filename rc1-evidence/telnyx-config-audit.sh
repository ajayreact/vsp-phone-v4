#!/usr/bin/env bash
set -euo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
AUTH=(-H "Authorization: Bearer ${K}")

echo "=== Phone +13136506292 ==="
curl -sS -G "${AUTH[@]}" \
  "https://api.telnyx.com/v2/phone_numbers" \
  --data-urlencode "filter[phone_number]=+13136506292" \
  -o /tmp/pn.json
python3 - <<'PY'
import json
for r in json.load(open('/tmp/pn.json')).get('data') or []:
    print(json.dumps({k:r.get(k) for k in ['phone_number','status','connection_id','connection_name','messaging_profile_id']}, indent=2))
PY

echo "=== Connection 2982156817053779933 ==="
curl -sS "${AUTH[@]}" \
  "https://api.telnyx.com/v2/credential_connections/2982156817053779933" \
  -o /tmp/conn.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/conn.json')).get('data') or {}
for section in ['connection_name','active','user_name','anchorsite_override','webhook_event_url','inbound_ips','outbound_ips']:
    print(f'{section}: {d.get(section)}')
print('inbound:', json.dumps(d.get('inbound') or {}, indent=2))
print('outbound:', json.dumps(d.get('outbound') or {}, indent=2))
print('ip_authentication:', json.dumps(d.get('ip_authentication') or {}, indent=2))
PY

echo "=== Public egress IP ==="
curl -sS -4 ifconfig.me; echo
