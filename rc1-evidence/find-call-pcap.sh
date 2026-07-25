#!/bin/bash
set -uo pipefail
CALL="${1:-TLYEOszuw35OP26ZLqtjCg}"
echo "Searching pcaps for $CALL"
for f in /tmp/telnyx-live.pcap /tmp/telnyx-fix-validation.pcap /tmp/telnyx-carrier-retest.pcap; do
  [ -f "$f" ] || continue
  if sudo tcpdump -nn -A -r "$f" 2>/dev/null | grep -q "$CALL"; then
    echo "=== FOUND in $f ==="
    sudo tcpdump -tttt -nn -A -r "$f" 2>/dev/null | \
      awk -v RS="" -v c="$CALL" 'index($0,c){print}' | \
      grep -E '^(2026-|INVITE |ACK |CANCEL |From:|P-Asserted|Call-ID:|CSeq:|SIP/2\.0 |Content-Type: application/sdp)' | head -n 80
  fi
done

# Telnyx D00 meaning + any extra fields via API for one call
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
curl -sS -G -H "Authorization: Bearer ${K}" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "page[size]=3" \
  "https://api.telnyx.com/v2/detail_records" -o /tmp/cdr3.json
python3 - <<'PY'
import json
for r in json.load(open('/tmp/cdr3.json')).get('data',[]):
  if r.get('direction')!='outbound':
    continue
  print('call', r.get('sip_call_id'))
  print('  connected', r.get('connected'), 'completed', r.get('completed'))
  print('  hangup', r.get('hangup_cause'), r.get('hangup_details'))
  print('  telnyx_error_code', r.get('telnyx_error_code'))
  print('  sip_invite_failure_status', r.get('sip_invite_failure_status'))
  print('  duration', r.get('started_at'), '->', r.get('finished_at'))
PY
