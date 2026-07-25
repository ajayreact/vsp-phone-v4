#!/bin/bash
# RC1 investigation: ringback vs PSTN delivery — read-only, no code changes
set -uo pipefail

CALL_PREFIX="${1:-TLYEOszuw35OP26ZLqtjCg}"
OUT="/tmp/rc1-call-investigation-${CALL_PREFIX}.txt"
PCAP_OUT="/tmp/rc1-call-packets-${CALL_PREFIX}.txt"

exec > >(tee "$OUT") 2>&1

echo "=== RC1 Call Investigation ==="
echo "Call-ID prefix: $CALL_PREFIX"
echo "Timestamp (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

# --- Find Call-ID in Kamailio logs (exact) ---
echo "=== 1. Kamailio logs (exact Call-ID match) ==="
FULL_CID=$(docker logs vsp-kamailio 2>&1 | grep "$CALL_PREFIX" | grep -oE '[A-Za-z0-9._-]+\.\.' | head -1)
if [ -z "$FULL_CID" ]; then
  FULL_CID="${CALL_PREFIX}.."
fi
echo "Resolved Call-ID: $FULL_CID"
docker logs --timestamps vsp-kamailio 2>&1 | grep "$FULL_CID" | while read -r line; do
  echo "$line"
done
echo

# --- Telnyx CDR ---
echo "=== 2. Telnyx Detail Record ==="
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
curl -sS -G -H "Authorization: Bearer ${K}" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "page[size]=30" \
  "https://api.telnyx.com/v2/detail_records" -o /tmp/telnyx-cdr-inv.json

python3 - <<PY
import json
prefix = "${CALL_PREFIX}"
d = json.load(open('/tmp/telnyx-cdr-inv.json'))
match = None
for r in d.get('data') or []:
    sid = r.get('sip_call_id') or ''
    if sid.startswith(prefix):
        match = r
        break
if not match:
    print('NO CDR MATCH for prefix', prefix)
else:
    print('sip_call_id:', match.get('sip_call_id'))
    for k in sorted(match.keys()):
        v = match[k]
        if v not in (None, '', [], {}):
            print(f'  {k}: {v}')
PY
echo

# --- Find pcap containing this Call-ID ---
echo "=== 3. PCAP search ==="
FOUND_PCAP=""
for f in /tmp/telnyx-test.pcap /tmp/telnyx-live.pcap /tmp/telnyx-fix-validation.pcap /tmp/telnyx-carrier-retest.pcap /tmp/*.pcap; do
  [ -f "$f" ] || continue
  if sudo tcpdump -nn -A -r "$f" 2>/dev/null | grep -q "$CALL_PREFIX"; then
    echo "FOUND in: $f ($(wc -c < "$f") bytes)"
    FOUND_PCAP="$f"
    break
  fi
done
if [ -z "$FOUND_PCAP" ]; then
  echo "WARNING: Call-ID not found in any /tmp/*.pcap"
  echo "Available pcaps:"
  ls -la /tmp/*.pcap 2>/dev/null || true
  echo
  echo "Attempting live extraction from all pcaps (partial)..."
  for f in /tmp/telnyx-fix-validation.pcap /tmp/telnyx-live.pcap; do
    [ -f "$f" ] || continue
    echo "--- scanning $f for desk INVITEs after 18:56 UTC ---"
    sudo tcpdump -tttt -nn -A -r "$f" 2>/dev/null | \
      awk '/2026-07-25 18:5[6-9]|2026-07-25 19:0/' | \
      grep -E 'INVITE sip:|SIP/2.0 [0-9]|Call-ID:|CSeq:|From:|CANCEL|ACK sip:|BYE sip:' | tail -n 80
  done
  exit 0
fi

# --- Extract full SIP messages for this dialog ---
echo "=== 4. SIP message extraction → $PCAP_OUT ==="
sudo tcpdump -tttt -nn -A -r "$FOUND_PCAP" 2>/dev/null > /tmp/pcap-ascii-full.txt

python3 - <<PY
import re
call_prefix = "${CALL_PREFIX}"
text = open('/tmp/pcap-ascii-full.txt', errors='replace').read()
# Split into packets (tcpdump blank line separated blocks with timestamp line)
blocks = re.split(r'\n(?=\d{4}-\d{2}-\d{2} )', text)
matched = []
for b in blocks:
    if call_prefix in b:
        matched.append(b)

open("${PCAP_OUT}", 'w').write('\n\n===PKT===\n\n'.join(matched))
print(f'Extracted {len(matched)} packet blocks containing Call-ID prefix')
PY

# --- Build ordered SIP ladder ---
echo "=== 5. Ordered SIP ladder (Call-ID $CALL_PREFIX) ==="
python3 - <<'PY'
import re
from datetime import datetime

call_prefix = "${CALL_PREFIX}"
raw = open("${PCAP_OUT}", errors='replace').read()
blocks = raw.split('\n\n===PKT===\n\n')

events = []

def parse_block(block):
    m = re.match(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)', block)
    if not m:
        return None
    ts = m.group(1)
    # direction from IP line
    ipm = re.search(r'IP (\S+) > (\S+):', block)
    src, dst = (ipm.group(1), ipm.group(2)) if ipm else ('?', '?')
    # find first SIP request/response line after headers
    sip_lines = []
    for line in block.splitlines():
        if re.match(r'^(INVITE|ACK|BYE|CANCEL|OPTIONS|REGISTER|PRACK|UPDATE|INFO|SIP/2\.0)', line.strip()):
            sip_lines.append(line.strip())
    if not sip_lines:
        return None
    primary = sip_lines[0]
    # extract key headers
    headers = {}
    for h in ['Call-ID', 'CSeq', 'From', 'To', 'Via', 'Content-Type', 'Proxy-Authorization', 'Proxy-Authenticate', 'P-Asserted-Identity', 'Record-Route']:
        hm = re.search(rf'^{h}:\s*(.+)$', block, re.M)
        if hm:
            headers[h] = hm.group(1).strip()
    has_sdp = 'Content-Type: application/sdp' in block
    return ts, src, dst, primary, headers, has_sdp, block

for b in blocks:
    if call_prefix not in b:
        continue
    p = parse_block(b)
    if not p:
        continue
    ts, src, dst, primary, headers, has_sdp, block = p
    events.append((ts, src, dst, primary, headers, has_sdp))

events.sort(key=lambda x: x[0])

# classify actor
def actor(ipport):
    if '192.76.120.10' in ipport:
        return 'Telnyx'
    if '122.177.247.143' in ipport:
        return 'Zoiper/client'
    if '172.31.39.116' in ipport or '32.196.41.160' in ipport:
        return 'Kamailio'
    return ipport

seen = set()
for ts, src, dst, primary, headers, has_sdp in events:
    cseq = headers.get('CSeq', '')
    key = (ts, primary, cseq)
    if key in seen:
        continue
    seen.add(key)
    sdp = ' [+SDP]' if has_sdp else ''
    print(f"{ts} UTC | {actor(src)} → {actor(dst)} | {primary}{sdp}")
    if headers.get('From'):
        print(f"           From: {headers['From'][:120]}")
    if headers.get('To'):
        print(f"           To:   {headers['To'][:120]}")
    if headers.get('CSeq'):
        print(f"           CSeq: {headers['CSeq']}")
    if primary.startswith('SIP/2.0'):
        code = primary.split()[1]
        if code in ('180', '183', '200', '487', '403', '482', '407', '100'):
            print(f"           *** Response code {code} ***")
    print()

# Summary counts
codes = [e[3] for e in events if e[3].startswith('SIP/2.0')]
print('=== Response summary ===')
for c in ['SIP/2.0 100', 'SIP/2.0 180', 'SIP/2.0 183', 'SIP/2.0 200', 'SIP/2.0 407', 'SIP/2.0 487', 'SIP/2.0 403', 'SIP/2.0 482']:
    n = sum(1 for x in codes if x.startswith(c))
    if n:
        print(f'  {c}: {n}')
for m in ['INVITE', 'ACK', 'CANCEL', 'BYE', 'PRACK']:
    n = sum(1 for e in events if e[3].startswith(m + ' '))
    if n:
        print(f'  {m}: {n}')

# CANCEL timing
for ts, src, dst, primary, headers, has_sdp in events:
    if primary.startswith('CANCEL'):
        print(f'\n=== CANCEL event ===')
        print(f'Timestamp: {ts} UTC')
        print(f'Source: {actor(src)} ({src})')
        print(f'Destination: {actor(dst)} ({dst})')
        print(f'CSeq: {headers.get("CSeq","")}')
PY

echo
echo "=== 6. Ringback analysis ==="
grep -E '180 Ringing|183 Session|application/sdp|m=audio' "$PCAP_OUT" | head -n 30 || echo "(no 180/183/SDP in extracted packets)"

echo
echo "Report saved: $OUT"
echo "Packets saved: $PCAP_OUT"
