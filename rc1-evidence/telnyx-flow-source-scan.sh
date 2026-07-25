#!/usr/bin/env bash
set -euo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
AUTH=(-H "Authorization: Bearer ${K}")

curl -sS -G "${AUTH[@]}" \
  "https://api.telnyx.com/v2/detail_records" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "filter[cld]=+18648082167" \
  --data-urlencode "page[size]=20" \
  -o /tmp/cdr864-all.json

python3 - <<'PY'
import json
rows=json.load(open('/tmp/cdr864-all.json')).get('data') or []
print('All CDRs to +18648082167:', len(rows))
for r in sorted(rows, key=lambda x: x.get('started_at','')):
    print(f"{r.get('started_at')} connected={r.get('connected')} flow_src=? hangup={r.get('hangup_cause')} cid={(r.get('sip_call_id') or '')[:28]} leg={r.get('id')}")

# expand session for each unique leg to get flow_source
import urllib.request
K=open('/opt/vsp-phone-v4/.env').read().split('TELNYX_API_KEY=')[1].split('\n')[0]
for r in rows:
    leg=r['id']
    dt=r.get('started_at','')
    url=f"https://api.telnyx.com/v2/session_analysis/sip-trunking/{leg}?expand=record&date_time={dt}"
    req=urllib.request.Request(url, headers={'Authorization':'Bearer '+K})
    try:
        d=json.loads(urllib.request.urlopen(req, timeout=20).read())
        rec=(d.get('root') or {}).get('record') or {}
        print(f"  leg {leg[:8]}... flow_source={rec.get('flow_source')} leg_direction={rec.get('leg_direction')} connected={rec.get('connected')} answer={rec.get('answered_at')}")
    except Exception as e:
        print(f"  leg {leg[:8]}... session err: {e}")
PY
