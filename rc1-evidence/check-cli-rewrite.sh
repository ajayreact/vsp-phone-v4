#!/bin/bash
set -uo pipefail
echo "HEAD=$(git -C /opt/vsp-phone-v4 rev-parse --short HEAD)"
echo "=== kamailio recent desk/carrier ==="
docker logs --timestamps --since 20m vsp-kamailio 2>&1 | \
  grep -E 'BRIDGE_CARRIER|from_rewritten|carrier auth|RC1_DESK_INVITE|CANCEL|cli=' | tail -n 50

echo "=== Telnyx latest outbound CDRs (cli/cld only) ==="
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
curl -sS -G -H "Authorization: Bearer ${K}" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "page[size]=5" \
  "https://api.telnyx.com/v2/detail_records" -o /tmp/telnyx-cdr-cli.json
python3 - <<'PY'
import json
d=json.load(open('/tmp/telnyx-cdr-cli.json'))
for r in (d.get('data') or [])[:5]:
  if r.get('direction') != 'outbound':
    continue
  print(f"sip_call_id={r.get('sip_call_id')} cli={r.get('cli')} cld={r.get('cld')} hangup={r.get('hangup_cause')} fail={r.get('sip_invite_failure_status')}")
PY

echo "=== latest outbound From header to Telnyx (pcap if present) ==="
PCAP=/tmp/telnyx-fix-validation.pcap
if [ -f "$PCAP" ]; then
  sudo tcpdump -tttt -nn -A -r "$PCAP" 2>/dev/null | \
    awk '/INVITE sip:\+1.*@sip.telnyx.com/{p=1} p{print} /Proxy-Authorization:/{if(p){c++}} c>=1 && /CSeq: 2 INVITE/{exit}' | \
    grep -E '^(2026-|INVITE |From:|P-Asserted|To:|Call-ID:|CSeq:|Proxy-Authorization)' | tail -n 40
fi
