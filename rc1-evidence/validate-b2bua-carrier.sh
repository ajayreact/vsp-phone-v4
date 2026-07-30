#!/usr/bin/env bash
# Validate true B2BUA carrier leg — Asterisk-identical ACK ownership.
# Usage (EC2): SEC=900 bash rc1-evidence/validate-b2bua-carrier.sh
set -euo pipefail
ROOT="${ROOT:-/opt/vsp-phone-v4}"
cd "$ROOT"
SEC="${SEC:-900}"
PHONE_IP="${PHONE_IP:-122.177.246.92}"
DEST="${DEST:-+17045502033}"
OUT="${OUT:-/tmp/b2bua-validate-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT"

COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env}"

log() { echo "[b2bua-validate] $*"; }

log "OUT=$OUT SEC=$SEC DEST=$DEST"
log "1) Ensure kamailio at B2BUA commit"
git log -1 --oneline | tee "$OUT/git-head.txt"
$COMPOSE exec -T kamailio kamailio -c -f /tmp/kamailio.runtime.cfg 2>&1 | tee "$OUT/kamailio-lint.txt"

log "2) Capture — place Grandstream → PSTN now; hold ≥10 min; hang up manually"
export PHONE_IP SEC
bash rc1-evidence/capture-teardown.sh 2>&1 | tee "$OUT/capture.log" || true

CAP=$(grep -oE '/tmp/teardown-capture-[0-9T]+Z' "$OUT/capture.log" | tail -1 || true)
PCAP=""
[[ -n "$CAP" && -s "$CAP/docker.pcap" ]] && PCAP="$CAP/docker.pcap"
[[ -z "$PCAP" && -n "$CAP" && -s "$CAP/all.pcap" ]] && PCAP="$CAP/all.pcap"
echo "$PCAP" >"$OUT/pcap-path.txt"
log "pcap=$PCAP"

if [[ -z "$PCAP" || ! -s "$PCAP" ]]; then
  log "FAIL: no pcap"
  exit 1
fi

log "3) ACK next-hop + ladder"
bash rc1-evidence/compare-ack-wire.sh "$PCAP" 2>&1 | tee "$OUT/compare-ack.txt" || true

log "4) B2BUA ownership checks (logs + pcap)"
$COMPOSE logs --tail=5000 kamailio 2>/dev/null | grep -E 'B2BUA|TM local ACK|uac:reply|BRIDGE_CARRIER_B2BUA' | tee "$OUT/b2bua-logs.txt" || true

python3 - <<'PY' "$PCAP" "$OUT/b2bua-gate.txt" 2>"$OUT/b2bua-gate.err"
import re, subprocess, sys
pcap, outp = sys.argv[1], sys.argv[2]
raw = subprocess.check_output(["sudo","tcpdump","-nn","-tttt","-A","-s0","-r",pcap], stderr=subprocess.DEVNULL).decode("latin1","replace")
blocks = re.split(r"(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+ IP )", raw)
t200 = tacks = None
bye_ack_timeout = False
separate_cid = False
desk_cid = carrier_cid = None
for b in blocks:
    hdr = b.split("\n",1)[0]
    body = b.split("\n",1)[1] if "\n" in b else ""
    ts = " ".join(hdr.split()[0:2]) if hdr else ""
    m = re.search(r"Call-ID:\s*([^\r\n]+)", body, re.I)
    cid = m.group(1).strip() if m else ""
    if body.startswith("INVITE ") and "122." in hdr and desk_cid is None:
        desk_cid = cid
    if body.startswith("INVITE ") and ("192.76.120.10" in hdr or "sip.telnyx.com" in body) and "122." not in hdr.split(">")[0]:
        if ".b2b" in cid or (desk_cid and cid != desk_cid):
            carrier_cid = cid
            separate_cid = True
    if "SIP/2.0 200 OK" in body and "INVITE" in body and "192.76.120.10" in hdr and t200 is None:
        t200 = ts
    if body.strip().startswith("ACK ") and t200 and ts >= t200 and ("192.76.120.10" in hdr) and tacks is None:
        tacks = ts
    if "ACK Timeout" in body or 'text="ACK Timeout"' in body:
        bye_ack_timeout = True
lines = []
lines.append(f"desk_call_id={desk_cid}")
lines.append(f"carrier_call_id={carrier_cid}")
lines.append(f"separate_call_id={'PASS' if separate_cid else 'FAIL'}")
lines.append(f"carrier_200_ts={t200}")
lines.append(f"carrier_ack_ts={tacks}")
delta = "n/a"
if t200 and tacks:
    from datetime import datetime
    try:
        fmt = "%Y-%m-%d %H:%M:%S.%f"
        ms = (datetime.strptime(tacks[:26], fmt) - datetime.strptime(t200[:26], fmt)).total_seconds() * 1000
        delta = f"{ms:.1f}"
        lines.append(f"ack_latency_ms={delta}")
        lines.append(f"ack_latency_gate={'PASS' if ms < 50 else 'FAIL'}")
    except Exception as e:
        lines.append(f"ack_latency_ms=parse-error:{e}")
        lines.append("ack_latency_gate=FAIL")
else:
    lines.append("ack_latency_ms=n/a")
    lines.append("ack_latency_gate=FAIL")
lines.append(f"ack_timeout_bye={'FAIL' if bye_ack_timeout else 'PASS'}")
open(outp, "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
sys.exit(0 if (separate_cid and tacks and not bye_ack_timeout) else 2)
PY

log "Gate results: $OUT/b2bua-gate.txt"
cat "$OUT/b2bua-gate.txt"
log "Done — also fetch Telnyx CDR call_sec>=600 and rtpengine list"
log "  $COMPOSE exec rtpengine rtpengine-ctl list | tee $OUT/rtpengine.txt"
log "Artifacts: $OUT"
