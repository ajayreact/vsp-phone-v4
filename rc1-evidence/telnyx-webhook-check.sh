#!/usr/bin/env bash
set -euo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2- | tr -d $'\r"')
CONN_ID="${TELNYX_CONNECTION_ID:-2982156817053779933}"
CALLID="${1:-1869413976-14212-6@BCC.BHH.CEH.BED}"

echo "=== Credential connection webhook ==="
curl -sS -H "Authorization: Bearer ${K}" \
  "https://api.telnyx.com/v2/credential_connections/${CONN_ID}" \
  -o /tmp/conn-webhook.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/conn-webhook.json')).get('data') or {}
print('connection_name:', d.get('connection_name'))
print('webhook_event_url:', d.get('webhook_event_url'))
print('webhook_api_version:', d.get('webhook_api_version'))
PY

echo
echo "=== CDR hangup fields for ${CALLID} ==="
curl -sS -G -H "Authorization: Bearer ${K}" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "filter[sip_call_id]=${CALLID}" \
  "https://api.telnyx.com/v2/detail_records" -o /tmp/cdr-one.json
python3 - <<'PY'
import json, os
callid = os.environ.get('CALLID', '')
rows = json.load(open('/tmp/cdr-one.json')).get('data') or []
r = next((x for x in rows if x.get('sip_call_id') == callid), rows[0] if rows else {})
for k in [
    'call_sec', 'hangup_cause', 'hangup_details', 'hangup_code',
    'started_at', 'answered_at', 'finished_at', 'sip_call_id',
]:
    print(f'  {k}: {r.get(k)}')
PY

echo
echo "=== API webhook/voice 404 around call end (22:26-22:27 UTC) ==="
docker logs --timestamps vsp-api 2>&1 \
  | grep 'webhook/voice' \
  | grep -E '2026-07-26T22:26:5|2026-07-26T22:27:0' \
  | tail -10 || echo "(none in window)"
