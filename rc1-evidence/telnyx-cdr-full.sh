#!/usr/bin/env bash
set -euo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2- | tr -d $'\r"')
CALLID="${1:-1869413976-14212-6@BCC.BHH.CEH.BED}"
PROFILE_ID="${2:-2982164000495633730}"

echo "=== Full CDR JSON ==="
curl -sS -G -H "Authorization: Bearer ${K}" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "filter[sip_call_id]=${CALLID}" \
  "https://api.telnyx.com/v2/detail_records" -o /tmp/cdr-full.json
python3 - <<'PY'
import json
rows = json.load(open('/tmp/cdr-full.json')).get('data') or []
if not rows:
    print('no rows')
else:
    print(json.dumps(rows[0], indent=2, sort_keys=True))
PY

echo
echo "=== Outbound voice profile ${PROFILE_ID} ==="
curl -sS -H "Authorization: Bearer ${K}" \
  "https://api.telnyx.com/v2/outbound_voice_profiles/${PROFILE_ID}" \
  -o /tmp/ovp.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/ovp.json')).get('data') or {}
print(json.dumps(d, indent=2, sort_keys=True))
PY
