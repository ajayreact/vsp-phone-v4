#!/usr/bin/env bash
set -euo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
AUTH=(-H "Authorization: Bearer ${K}")

echo "=== Outbound Voice Profile ==="
curl -sS "${AUTH[@]}" \
  "https://api.telnyx.com/v2/outbound_voice_profiles/2982164000495633730" \
  -o /tmp/obvp.json -w "HTTP=%{http_code}\n"
python3 - <<'PY'
import json
d=json.load(open('/tmp/obvp.json'))
print(json.dumps(d, indent=2))
PY

echo
echo "=== Full CDR by id ==="
python3 - <<'PY'
import json
print(json.dumps(json.load(open('/tmp/telnyx-bleg-cdr-by-id.json')), indent=2))
PY

echo
echo "=== Full session analysis ==="
python3 - <<'PY'
import json
print(json.dumps(json.load(open('/tmp/telnyx-bleg-session-call-session.json')), indent=2))
PY

echo
echo "=== CDR filtered by cli/cld/time ==="
curl -sS -G "${AUTH[@]}" \
  "https://api.telnyx.com/v2/detail_records" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "filter[cli]=+13136506292" \
  --data-urlencode "filter[cld]=+18648082167" \
  --data-urlencode "filter[date_range]=today" \
  -o /tmp/cdr-filtered.json -w "HTTP=%{http_code}\n"
python3 - <<'PY'
import json
d=json.load(open('/tmp/cdr-filtered.json'))
for r in d.get('data') or []:
    if 'TLYEOszuw35OP26ZLqtjCg' in (r.get('sip_call_id') or ''):
        print(json.dumps(r, indent=2))
PY

echo
echo "=== Try SIP debug search (encoded) ==="
curl -sS -G "${AUTH[@]}" \
  "https://api.telnyx.com/v2/reports/sip_call_flows" \
  --data-urlencode "filter[cli]=+13136506292" \
  --data-urlencode "filter[cld]=+18648082167" \
  --data-urlencode "filter[date_range]=today" \
  -o /tmp/sip-flows.json -w "HTTP=%{http_code}\n"
head -c 2000 /tmp/sip-flows.json; echo

echo
echo "=== Try call-session detail record type ==="
curl -sS -G "${AUTH[@]}" \
  "https://api.telnyx.com/v2/detail_records" \
  --data-urlencode "filter[record_type]=call-session" \
  --data-urlencode "filter[id]=9a673e20-885b-11f1-9f61-02420aef93a0" \
  -o /tmp/call-session-cdr.json -w "HTTP=%{http_code}\n"
python3 - <<'PY'
import json
print(json.dumps(json.load(open('/tmp/call-session-cdr.json')), indent=2)[:6000])
PY
