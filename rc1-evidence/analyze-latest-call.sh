#!/bin/bash
set -uo pipefail
# Capture recent Telnyx SIP if no recent pcap, else use live tcpdump briefly isn't needed —
# dump from existing capture or a short new one.
CALL1="8dcIT9VcRB03GlQoI7ZPmw"
CALL2="4mnGNgDQn6Ocdmg73qVsqw"

# Prefer a fresh short capture if old one is stale; also try reading any existing.
PCAP=/tmp/telnyx-ringback-check.pcap
sudo timeout 2 tcpdump -i ens5 -nn -s0 -c 1 host 192.76.120.10 >/dev/null 2>&1 || true

# Extract SIP status lines for both Call-IDs from a fresh 90s historical isn't available;
# use docker/tcpdump offline if fixval exists, else start a one-shot decode of kernel? 
# Instead: use ss/tcpdump of recent by replaying from /tmp if present, else use tshark on new.

# Best: capture nothing; use kamailio can't see replies. Run tcpdump read of current open pcap files.
ls -la /tmp/*.pcap 2>/dev/null | tail -n 20

for PCAP in /tmp/telnyx-fix-validation.pcap /tmp/telnyx-ringback-check.pcap; do
  if [ -f "$PCAP" ]; then
    echo "=== PCAP $PCAP ==="
    sudo tcpdump -tttt -nn -A -r "$PCAP" 2>/dev/null | grep -E "SIP/2.0|INVITE |CSeq:|Call-ID:|From:|P-Asserted|Remote-Party|Contact:|${CALL1}|${CALL2}" | head -n 200
  fi
done

# Also query Telnyx detail logs API if possible for recent calls
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
echo "=== Telnyx detail records (recent) ==="
curl -sS -H "Authorization: Bearer ${K}" \
  "https://api.telnyx.com/v2/detail_records?filter[record_type]=sip-trunking&page[size]=10" \
  -o /tmp/telnyx-detail.json -w "STATUS=%{http_code}\n" || true
# page[size] may break curl; try without
curl -sS -G -H "Authorization: Bearer ${K}" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "page[size]=10" \
  "https://api.telnyx.com/v2/detail_records" -o /tmp/telnyx-detail.json -w "STATUS=%{http_code}\n"
python3 - <<'PY'
import json
try:
  d=json.load(open('/tmp/telnyx-detail.json'))
except Exception as e:
  print('parse fail', e); print(open('/tmp/telnyx-detail.json').read()[:800]); raise
print('keys', d.keys())
data=d.get('data') or []
print('count', len(data))
for r in data[:10]:
  print('---')
  for k in ['created_at','direction','cli','cld','call_id','sip_call_id','status','hangup_cause','hangup_cause_code','answered','ring_duration','call_duration','cost','connection_id','from','to']:
    if k in r: print(f'  {k}: {r.get(k)}')
  # print a few more interesting keys
  for k,v in r.items():
    if k not in ('created_at','direction','cli','cld','call_id','sip_call_id','status','hangup_cause','hangup_cause_code','answered','ring_duration','call_duration','cost','connection_id','from','to') and v not in (None,'',[],{}):
      if k in ('record_type','session_id','leg_id','sip_invite_failure_status','sip_invite_failure_phrase','tags'):
        print(f'  {k}: {v}')
PY
