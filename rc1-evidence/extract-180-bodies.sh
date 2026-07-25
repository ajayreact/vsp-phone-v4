#!/bin/bash
set -uo pipefail
CALL=TLYEOszuw35OP26ZLqtjCg
PCAP=/tmp/telnyx-fix-validation.pcap
sudo tcpdump -tttt -nn -A -r "$PCAP" 2>/dev/null > /tmp/pcap-full.txt

python3 - <<'PY'
import re
call = "TLYEOszuw35OP26ZLqtjCg"
text = open('/tmp/pcap-full.txt', errors='replace').read()
blocks = re.split(r'\n(?=\d{4}-\d{2}-\d{2} )', text)

def show_block(label, block):
    print(f'===== {label} =====')
    lines = block.splitlines()
    for line in lines[:40]:
        print(line)
    if len(lines) > 40:
        print('... [truncated]')
    print()

for b in blocks:
    if call not in b:
        continue
    if '180 Ringing' in b and '192.76.120.10' in b.split('\n')[0]:
        show_block('Telnyx → Kamailio: 180 Ringing', b)
    if '180 Ringing' in b and '122.177.247.143' in b and '172.31.39.116.5060 >' in b:
        show_block('Kamailio → Zoiper: 180 Ringing', b)
    if b.strip().startswith('2026') and 'CANCEL sip:18648082167' in b and '122.177.247.143' in b.split('\n')[0]:
        show_block('Zoiper → Kamailio: CANCEL', b)
    if 'INVITE sip:+18648082167@sip.telnyx.com' in b and 'Proxy-Authorization' in b:
        show_block('Kamailio → Telnyx: authenticated INVITE', b)
PY
