#!/bin/bash
set -uo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
CALL="${1:-7ccFblWwADbO_zzMB1SmNQ}"

echo "=== Kamailio logs for Call-ID prefix $CALL ==="
docker logs --timestamps vsp-kamailio 2>&1 | grep "$CALL" | tail -n 30

echo
echo "=== Telnyx CDR matching sip_call_id ==="
curl -sS -G -H "Authorization: Bearer ${K}" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "page[size]=20" \
  "https://api.telnyx.com/v2/detail_records" -o /tmp/telnyx-cdr-search.json

python3 - <<PY
import json
call_prefix = "${CALL}"
d=json.load(open('/tmp/telnyx-cdr-search.json'))
for r in d.get('data') or []:
  sid = r.get('sip_call_id') or ''
  if not sid.startswith(call_prefix):
    continue
  print('==== MATCH', sid, '====')
  for k in sorted(r.keys()):
    v=r[k]
    if v in (None,'',[],{}): continue
    print(f'  {k}: {v}')
PY

echo
echo "=== Start 120s packet capture (place call now if repeating test) ==="
sudo bash -c 'pkill -f "tcpdump.*telnyx-live.pcap" 2>/dev/null || true'
sudo bash -c 'setsid tcpdump -i ens5 -tttt -nn -s0 -w /tmp/telnyx-live.pcap host 192.76.120.10 or host 122.177.247.143 < /dev/null > /tmp/tcpdump-live.log 2>&1 &'
sleep 1
ps aux | grep '[t]cpdump.*telnyx-live'
