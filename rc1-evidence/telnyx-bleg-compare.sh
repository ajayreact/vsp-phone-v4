#!/usr/bin/env bash
set -euo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
AUTH=(-H "Authorization: Bearer ${K}")

compare_session() {
  local label="$1" leg="$2" dt="$3"
  echo "=== $label ==="
  curl -sS "${AUTH[@]}" \
    "https://api.telnyx.com/v2/session_analysis/sip-trunking/${leg}?include_children=true&max_depth=5&expand=record&date_time=${dt}" \
    -o "/tmp/sa-${leg}.json"
  python3 - <<PY
import json
d=json.load(open('/tmp/sa-${leg}.json'))
rec=(d.get('root') or {}).get('record') or {}
keys=['sip_call_id','started_at','finished_at','answered_at','connected','attempted','hangup_cause','hangup_code','hangup_details','telnyx_error_code','sip_invite_failure_status','flow_dest','flow_source','leg_direction','route','lrn','term_lrn_ocn','call_sec','billed_sec','rtp_use_codec_name','has_telnyx_retried_internally','preferred_anchorsite','shaken_stir']
for k in keys:
    print(f'  {k}: {rec.get(k)}')
if rec.get('started_at') and rec.get('answered_at'):
    from datetime import datetime
    s=datetime.fromisoformat(rec['started_at'].replace('Z','+00:00'))
    a=datetime.fromisoformat(rec['answered_at'].replace('Z','+00:00'))
    print(f'  answer_delay_sec: {(a-s).total_seconds():.1f}')
PY
  echo
}

# Failed RC1 call
compare_session "FAILED RC1 call TLYEOszuw35OP26ZLqtjCg" \
  "9a674ce4-885b-11f1-8b7b-02420aef93a0" "2026-07-25T19:04:03Z"

# Earlier failed same dest
compare_session "FAILED earlier same dest 7CcFblWwADbO" \
  "9a674ce4-885b-11f1-8b7b-02420aef93a0" "2026-07-25T18:57:31Z"

# Need leg id for 7CcFbl - fetch from CDR
curl -sS -G "${AUTH[@]}" \
  "https://api.telnyx.com/v2/detail_records" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "page[size]=50" \
  -o /tmp/cdr-all.json
python3 - <<'PY'
import json
for r in json.load(open('/tmp/cdr-all.json')).get('data') or []:
    if (r.get('sip_call_id') or '').startswith('7CcFblWwADbO'):
        print('7CcF leg', r.get('id'), 'session', r.get('telnyx_session_id'))
PY

LEG7=$(python3 - <<'PY'
import json
for r in json.load(open('/tmp/cdr-all.json')).get('data') or []:
    if (r.get('sip_call_id') or '').startswith('7CcFblWwADbO'):
        print(r.get('id')); break
PY
)
if [ -n "$LEG7" ]; then
  compare_session "FAILED 7CcFblWwADbO_zzMBlSMnQ" "$LEG7" "2026-07-25T18:57:31Z"
fi

# Successful historical call to same number
curl -sS -G "${AUTH[@]}" \
  "https://api.telnyx.com/v2/detail_records" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "filter[cld]=+18648082167" \
  --data-urlencode "filter[connected]=1" \
  --data-urlencode "page[size]=5" \
  -o /tmp/cdr-ok.json
OK_LEG=$(python3 - <<'PY'
import json
rows=json.load(open('/tmp/cdr-ok.json')).get('data') or []
rows.sort(key=lambda r: r.get('started_at',''), reverse=True)
if rows:
    print(rows[0]['id'])
PY
)
OK_START=$(python3 - <<'PY'
import json
rows=json.load(open('/tmp/cdr-ok.json')).get('data') or []
rows.sort(key=lambda r: r.get('started_at',''), reverse=True)
if rows:
    print(rows[0]['started_at'])
PY
)
if [ -n "$OK_LEG" ]; then
  compare_session "SUCCESS historical +18648082167 connected=1" "$OK_LEG" "$OK_START"
fi
