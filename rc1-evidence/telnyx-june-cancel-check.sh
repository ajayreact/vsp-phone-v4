#!/usr/bin/env bash
set -euo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
AUTH=(-H "Authorization: Bearer ${K}")

# June cancelled call to same dest - leg 0a708b60
SID=$(curl -sS -G "${AUTH[@]}" \
  "https://api.telnyx.com/v2/detail_records" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "filter[id]=0a708b60-7306-11f1-aab1-02420a21041f" | \
  python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['telnyx_session_id'])")

echo "June cancelled session: $SID"
curl -sS -G "${AUTH[@]}" \
  "https://api.telnyx.com/v2/detail_records" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "filter[telnyx_session_id]=${SID}" \
  -o /tmp/june-cancel.json

python3 - <<PY
import json, urllib.request
rows=json.load(open('/tmp/june-cancel.json')).get('data') or []
print('CDR count:', len(rows))
for r in rows:
    print(f"  {r.get('id')} conn={r.get('connected')} hangup={r.get('hangup_cause')} cid={(r.get('sip_call_id') or '')[:30]}")
K=open('/opt/vsp-phone-v4/.env').read().split('TELNYX_API_KEY=')[1].split('\n')[0]
for r in rows:
    leg=r['id']; dt=r['started_at']
    url=f"https://api.telnyx.com/v2/session_analysis/sip-trunking/{leg}?expand=record&date_time={dt}"
    req=urllib.request.Request(url, headers={'Authorization':'Bearer '+K})
    rec=(json.loads(urllib.request.urlopen(req).read()).get('root') or {}).get('record') or {}
    print(f"    flow={rec.get('flow_source')} dir={rec.get('leg_direction')}")
PY
