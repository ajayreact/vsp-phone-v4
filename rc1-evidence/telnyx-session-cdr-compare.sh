#!/usr/bin/env bash
set -euo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
AUTH=(-H "Authorization: Bearer ${K}")

dump() {
  local label="$1" sid="$2" dt="$3"
  echo "=== $label session $sid ==="
  curl -sS "${AUTH[@]}" \
    "https://api.telnyx.com/v2/session_analysis/call-session/${sid}?include_children=true&max_depth=5&expand=record&date_time=${dt}" \
    -o "/tmp/tree2-${label}.json"
  curl -sS -G "${AUTH[@]}" \
    "https://api.telnyx.com/v2/detail_records" \
    --data-urlencode "filter[record_type]=sip-trunking" \
    --data-urlencode "filter[telnyx_session_id]=${sid}" \
    -o "/tmp/cdrs-${label}.json"
  python3 - <<PY
import json
label="${label}"
tree=json.load(open('/tmp/tree2-${label}.json'))
cdrs=json.load(open('/tmp/cdrs-${label}.json'))
print('Session tree nodes:')
def walk(n,d=0):
    rec=n.get('record') or {}
    print('  '*d + f"id={n.get('id')} flow={rec.get('flow_source')} dir={rec.get('leg_direction')} conn={rec.get('connected')} ans={rec.get('answered_at')}")
    for c in n.get('children') or []: walk(c,d+1)
walk(tree.get('root') or {})
print(f"CDR rows ({len(cdrs.get('data') or [])}):")
for r in cdrs.get('data') or []:
    print(f"  leg={r.get('id')} conn={r.get('connected')} dir={r.get('direction')} cid={(r.get('sip_call_id') or '')[:30]} hangup={r.get('hangup_cause')}")
PY
  echo
}

OK_SID=$(curl -sS -G "${AUTH[@]}" \
  "https://api.telnyx.com/v2/detail_records" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "filter[id]=9b90219e-7317-11f1-bcc2-02420a0dda1f" | \
  python3 -c "import json,sys; print(json.load(sys.stdin)['data'][0]['telnyx_session_id'])")

dump FAIL_TLYEO 9a673e20-885b-11f1-9f61-02420aef93a0 2026-07-25T19:04:03Z
dump SUCCESS_TRUNK "${OK_SID}" 2026-06-28T17:34:25Z
