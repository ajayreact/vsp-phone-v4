#!/usr/bin/env bash
set -euo pipefail
cd /opt/vsp-phone-v4
APIKEY="$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2- | tr -d $'\r"')"
URL="https://api.telnyx.com/v2/detail_records?filter%5Brecord_type%5D=sip-trunking&filter%5Bdate_range%5D=last_24_hours&page%5Bsize%5D=20"
curl -sS -g -H "Authorization: Bearer ${APIKEY}" "${URL}" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
for r in d.get('data', []):
    print(
        r.get('call_sec'),
        r.get('hangup_cause'),
        r.get('hangup_source'),
        (r.get('sip_call_id') or '')[:50],
        r.get('started_at'),
        r.get('finished_at'),
    )
"
