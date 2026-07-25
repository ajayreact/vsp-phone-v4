#!/usr/bin/env bash
set -euo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
AUTH=(-H "Authorization: Bearer ${K}")

dump_tree() {
  local label="$1" sid="$2" dt="$3"
  echo "=== $label session $sid ==="
  curl -sS "${AUTH[@]}" \
    "https://api.telnyx.com/v2/session_analysis/call-session/${sid}?include_children=true&max_depth=5&expand=record&date_time=${dt}" \
    -o "/tmp/tree-${sid}.json"
  python3 - <<PY
import json
d=json.load(open('/tmp/tree-${sid}.json'))
def walk(n, depth=0):
    rec=n.get('record') or {}
    print('  '*depth + f"{n.get('id')} flow={rec.get('flow_source')} dir={rec.get('leg_direction')} conn={rec.get('connected')} ans={rec.get('answered_at')} hangup={rec.get('hangup_cause')}")
    for c in n.get('children') or []:
        walk(c, depth+1)
root=d.get('root') or {}
walk(root)
print('event_count', (d.get('meta') or {}).get('event_count'))
PY
  echo
}

# Failed RC1
dump_tree "FAILED TLYEO" "9a673e20-885b-11f1-9f61-02420aef93a0" "2026-07-25T19:04:03Z"

# Successful June SIP trunk A-leg session - get session id from CDR
python3 - <<'PY'
import json, urllib.request, os
K=open('/opt/vsp-phone-v4/.env').read().split('TELNYX_API_KEY=')[1].split('\n')[0]
req=urllib.request.Request('https://api.telnyx.com/v2/detail_records?filter[record_type]=sip-trunking&filter[cld]=+18648082167&page[size]=20', headers={'Authorization':'Bearer '+K})
rows=json.loads(urllib.request.urlopen(req).read()).get('data') or []
for r in rows:
    if r.get('connected')==1 and (r.get('sip_call_id') or '').startswith('1d0fbdfe'):
        print(r['telnyx_session_id'], r['id'], r['started_at'])
        break
PY

dump_tree "SUCCESS 1d0fbdfe SIP trunk" "9b90219e-7317-11f1-bcc2-02420a0dda1f" "2026-06-28T17:34:25Z"
