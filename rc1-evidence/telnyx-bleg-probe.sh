#!/usr/bin/env bash
set -euo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
AUTH=(-H "Authorization: Bearer ${K}")
SID=9a673e20-885b-11f1-9f61-02420aef93a0
LEG=9a674ce4-885b-11f1-8b7b-02420aef93a0
FS=885f1ddd-a1e8-4636-81de-f6f21a405ae7

try() {
  local name="$1"; shift
  local out="/tmp/telnyx-probe-${name}.json"
  local code
  code=$(curl -sS -o "$out" -w '%{http_code}' "${AUTH[@]}" "$@" 2>/dev/null || echo ERR)
  echo "[$code] $*"
  if [ -f "$out" ]; then head -c 1200 "$out"; echo; fi
  echo "---"
}

echo "=== Probe Telnyx debug / B-leg endpoints ==="
try call-events "https://api.telnyx.com/v2/call_events?filter[telnyx_session_id]=${SID}"
try channel-events "https://api.telnyx.com/v2/channel_events?filter[fs_channel_id]=${FS}"
try reports-cdr "https://api.telnyx.com/v2/reports/cdr?filter[telnyx_session_id]=${SID}"
try reports-voice "https://api.telnyx.com/v2/reports/voice?filter[telnyx_session_id]=${SID}"
try debug-detail "https://api.telnyx.com/v2/debug/detail_records/${LEG}"
try leg "https://api.telnyx.com/v2/call_legs/${LEG}"
try session "https://api.telnyx.com/v2/call_sessions/${SID}"
try fs "https://api.telnyx.com/v2/fs_channels/${FS}"

echo "=== Compare recent outbound to +18648082167 ==="
curl -sS -G "${AUTH[@]}" \
  "https://api.telnyx.com/v2/detail_records" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "filter[cld]=+18648082167" \
  --data-urlencode "page[size]=10" \
  -o /tmp/cdr-864.json
python3 - <<'PY'
import json
for r in json.load(open('/tmp/cdr-864.json')).get('data') or []:
    print('---')
    for k in ['sip_call_id','started_at','finished_at','connected','attempted','hangup_cause','hangup_code','hangup_details','telnyx_error_code','sip_invite_failure_status','answered_at','call_sec','route','lrn']:
        print(f'  {k}: {r.get(k)}')
PY

echo "=== Compare connected outbound calls today ==="
curl -sS -G "${AUTH[@]}" \
  "https://api.telnyx.com/v2/detail_records" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "filter[date_range]=today" \
  --data-urlencode "page[size]=20" \
  -o /tmp/cdr-today.json
python3 - <<'PY'
import json
rows=json.load(open('/tmp/cdr-today.json')).get('data') or []
for r in rows:
    if r.get('direction')!='outbound':
        continue
    print(f"{r.get('started_at')} cid={r.get('sip_call_id','')[:24]} connected={r.get('connected')} attempted={r.get('attempted')} hangup={r.get('hangup_cause')} err={r.get('telnyx_error_code')} fail={r.get('sip_invite_failure_status')} cld={r.get('cld')}")
PY
