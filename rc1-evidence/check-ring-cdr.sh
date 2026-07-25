#!/bin/bash
set -uo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)

curl -sS -G -H "Authorization: Bearer ${K}" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "page[size]=8" \
  "https://api.telnyx.com/v2/detail_records" -o /tmp/telnyx-cdr-full.json

python3 - <<'PY'
import json
d=json.load(open('/tmp/telnyx-cdr-full.json'))
keys_of_interest=[
  'sip_call_id','direction','cli','cld','hangup_cause','sip_invite_failure_status',
  'answered','call_sec','billable_time','billable','started_at','finished_at',
  'created_at','completed_at','ring_sec','is_alive','currency','cost',
  'connection_id','user_session_id','tags','sip_response_code','disposition'
]
for r in d.get('data') or []:
  if r.get('direction')!='outbound':
    continue
  print('====')
  # print all non-empty fields for diagnosis
  for k,v in sorted(r.items()):
    if v in (None,'',[],{}): continue
    print(f'  {k}: {v}')
PY

echo "=== credential connection outbound ringback settings ==="
curl -sS -H "Authorization: Bearer ${K}" \
  "https://api.telnyx.com/v2/credential_connections/2982156817053779933" -o /tmp/telnyx-conn.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/telnyx-conn.json')).get('data',{})
ob=d.get('outbound') or {}
print('connection_name', d.get('connection_name'))
print('active', d.get('active'))
print('outbound.instant_ringback_enabled', ob.get('instant_ringback_enabled'))
print('outbound.generate_ringback_tone', ob.get('generate_ringback_tone'))
print('outbound.ani_override', ob.get('ani_override'))
print('outbound.ani_override_type', ob.get('ani_override_type'))
print('outbound.outbound_voice_profile_id', ob.get('outbound_voice_profile_id'))
print('outbound.localization', ob.get('localization'))
PY

echo "=== phone number +13136506292 assignment ==="
curl -sS -G -H "Authorization: Bearer ${K}" \
  --data-urlencode "filter[phone_number]=+13136506292" \
  "https://api.telnyx.com/v2/phone_numbers" -o /tmp/telnyx-pn.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/telnyx-pn.json'))
for r in d.get('data') or []:
  print('phone', r.get('phone_number'), 'status', r.get('status'), 'connection_id', r.get('connection_id'), 'connection_name', r.get('connection_name'))
PY

# Fresh pcap extract for latest call From header
CALL=j4jmyeEhSPsbhaNfSFbKwA
echo "=== wire From for $CALL (if in live iface - start short capture of existing pcap files) ==="
# try any recent pcap containing this call
for f in /tmp/telnyx-fix-validation.pcap /tmp/*.pcap; do
  [ -f "$f" ] || continue
  if sudo tcpdump -nn -A -r "$f" 2>/dev/null | grep -q "$CALL"; then
    echo "found in $f"
    sudo tcpdump -tttt -nn -A -r "$f" 2>/dev/null | awk -v c="$CALL" 'BEGIN{RS=""} $0 ~ c {print; print "---"}' | grep -E 'INVITE sip:|From:|P-Asserted|Call-ID:|CSeq:|SIP/2.0 1|SIP/2.0 2|SIP/2.0 4|SIP/2.0 5|CANCEL' | head -n 80
    break
  fi
done
