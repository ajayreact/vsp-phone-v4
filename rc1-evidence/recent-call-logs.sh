#!/bin/bash
set -uo pipefail
echo "=== recent kamailio carrier/desk ==="
docker logs --timestamps --since 45m vsp-kamailio 2>&1 | \
  grep -E '18648082167|13174492106|17045502033|from_rewritten|carrier auth|BRIDGE_CARRIER|CANCEL|487|180 Ring|200 OK|183 Session' | tail -n 80

echo "=== latest 5 outbound CDRs full ==="
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
curl -sS -G -H "Authorization: Bearer ${K}" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "page[size]=5" \
  "https://api.telnyx.com/v2/detail_records" -o /tmp/cdr5.json
python3 - <<'PY'
import json
for r in json.load(open('/tmp/cdr5.json')).get('data',[]):
  if r.get('direction')!='outbound':
    continue
  print('====', r.get('sip_call_id'))
  for k in ['cli','cld','connected','attempted','hangup_cause','sip_invite_failure_status','telnyx_error_code','telnyx_error_message','started_at','finished_at','call_sec','billed_sec','lrn','dest_number','route','shaken_stir','sip_from_url','orig_jip','has_telnyx_retried_internally']:
    if k in r and r[k] not in (None,''):
      print(f'  {k}: {r[k]}')
PY
