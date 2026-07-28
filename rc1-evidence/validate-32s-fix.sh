#!/usr/bin/env bash
# RC1 final validation for 83d35d7 explicit carrier ACK fix.
# Usage: SEC=420 bash rc1-evidence/validate-32s-fix.sh
# Place PSTN call from Grandstream/Zoiper and hold >= 5 minutes.
set -euo pipefail
cd /opt/vsp-phone-v4

SEC="${SEC:-420}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="/tmp/rc1-validate-${STAMP}"
mkdir -p "$OUT"

log() { echo "[rc1-validate] $*"; }

log "=== Deploy verification ==="
git log --oneline -1 | tee "$OUT/git-head.txt" || true
docker ps --filter name=vsp-kamailio --format '{{.Names}} {{.Status}}' | tee "$OUT/container.txt"
docker exec vsp-kamailio grep -c 'DESK_NORMALIZE_CARRIER_REPLY' /tmp/kamailio.runtime.cfg | tee "$OUT/runtime-desk-normalize.txt"
docker exec vsp-kamailio grep -c 'carrier ACK TX pre-send' /tmp/kamailio.runtime.cfg | tee "$OUT/runtime-orphan-ack.txt" || echo 0 | tee "$OUT/runtime-orphan-ack.txt"

log "OUT=$OUT — dial PSTN now, hold >= 5 minutes (${SEC}s capture)"
SEC="$SEC" bash rc1-evidence/capture-teardown.sh 2>&1 | tee "$OUT/capture.log" || true

# Find capture dir from capture-teardown output
CAP=$(grep -oE '/tmp/teardown-capture-[0-9T]+Z' "$OUT/capture.log" | tail -1 || true)
if [[ -n "$CAP" && -d "$CAP" ]]; then
  cp -a "$CAP" "$OUT/pcap-data"
fi

log "=== Kamailio ACK trace ==="
docker logs --since "$((SEC + 60))"s vsp-kamailio 2>&1 \
  | grep -E 'desk carrier reply normalized|carrier phone ACK relay|carrier phone ACK absorbed|carrier encoded Contact|carrier 200 OK|BYE received|carrier ACK TX' \
  | tee "$OUT/kamailio-ack.log" || true

log "=== Telnyx CDR ==="
bash rc1-evidence/telnyx-cdr-fetch.sh 2>/dev/null | head -10 | tee "$OUT/cdr.txt" || true

CALLID=$(grep -oE '[0-9]+-[0-9]+-[0-9]+@BCC\.BHH\.CEH\.BED' "$OUT/kamailio-ack.log" | tail -1 || true)
if [[ -n "$CALLID" ]]; then
  log "=== Analyzing call $CALLID ==="
  bash rc1-evidence/investigate-32s-call.sh "$CALLID" 2>&1 | tee "$OUT/investigate.txt" || true
  PCAP="$OUT/pcap-data/all.pcap"
  [[ ! -s "$PCAP" && -s "$OUT/pcap-data/docker.pcap" ]] && PCAP="$OUT/pcap-data/docker.pcap"
  if [[ -s "$PCAP" ]]; then
    python3 <<PY | tee "$OUT/ack-wire.txt"
import subprocess,re
pcap="$PCAP"
cid="$CALLID"
raw=subprocess.check_output(['sudo','tcpdump','-nn','-tttt','-A','-s0','-r',pcap],stderr=subprocess.DEVNULL).decode('latin1','replace')
blocks=re.split(r'(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+ IP )', raw)
ok200=None; acks=[]; byes=[]
for b in blocks:
    if cid not in b: continue
    hdr=b.split('\n',1)[0]
    ts=hdr.split()[0]+' '+hdr.split()[1]
    body=b.split('\n',1)[1] if '\n' in b else ''
    if 'SIP/2.0 200 OK' in body and 'CSeq: 11 INVITE' in body and '192.76.120.10' in hdr and '> 172.31' in hdr:
        if ok200 is None: ok200=ts
    if re.search(r'^ACK sip:', body, re.M):
        acks.append((ts,hdr,body))
    if re.search(r'^BYE sip:', body, re.M) or 'SIP: BYE' in hdr:
        byes.append((ts,hdr,body))
print('first_carrier_200_OK:', ok200)
print('ack_count:', len(acks))
print('ack_after_200:', [a[0] for a in acks if ok200 and a[0]>ok200])
print('bye_count:', len(byes))
for label,items in [('FIRST_ACK',acks[:1]),('ACKS_AFTER_200',[a for a in acks if ok200 and a[0]>ok200][:3]),('FIRST_BYE',byes[:1])]:
    for ts,hdr,body in items:
        print('---',label,ts,'---')
        print(hdr)
        for line in body.splitlines():
            s=line.strip()
            if s.startswith(('ACK ','BYE ','Call-ID','CSeq','Via','Route','Contact','Reason','To:','From:')):
                print(' ',s)
PY
  fi
fi

log "=== PASS/FAIL heuristic ==="
{
  echo "validate_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "out=$OUT"
  echo "desk_normalize=$(grep -c 'desk carrier reply normalized' "$OUT/kamailio-ack.log" 2>/dev/null || echo 0)"
  echo "phone_ack_relay=$(grep -c 'carrier phone ACK relay' "$OUT/kamailio-ack.log" 2>/dev/null || echo 0)"
  echo "orphan_ack_tx=$(grep -c 'carrier ACK TX' "$OUT/kamailio-ack.log" 2>/dev/null || echo 0)"
  echo "bye_ack_timeout=$(grep -c 'ACK Timeout' "$OUT/ack-wire.txt" 2>/dev/null || echo 0)"
  CDR_SEC=$(head -1 "$OUT/cdr.txt" 2>/dev/null | awk '{print $1}' || echo 0)
  echo "latest_cdr_call_sec=$CDR_SEC"
  if grep -q 'carrier phone ACK relay' "$OUT/kamailio-ack.log" 2>/dev/null \
      && [[ "${CDR_SEC:-0}" -ge 300 ]] 2>/dev/null \
      && [[ "$(grep -c 'ACK Timeout' "$OUT/ack-wire.txt" 2>/dev/null || echo 0)" -eq 0 ]]; then
    echo "result=PASS"
  else
    echo "result=PENDING_OR_FAIL"
  fi
} | tee "$OUT/summary.txt"

log "Done — review $OUT/summary.txt"
