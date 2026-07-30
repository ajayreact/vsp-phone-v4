#!/usr/bin/env bash
# Reference PBX interoperability test: Asterisk (PJSIP) vs Kamailio, same Telnyx credential.
#
# Phase A — Asterisk reference (automated outbound originate to PSTN)
# Phase B — Kamailio Grandstream capture (operator places call during window)
#
# Usage (EC2):
#   export DEST=+17045502033
#   export PHONE_IP=122.177.246.92
#   export KAM_SEC=420
#   bash rc1-evidence/pbx-interop-test.sh
#
# Optional: Grandstream → Asterisk desk reference (temporary GS SIP server = EC2:5160):
#   export GS_ASTERISK_DESK=1
#   # Point GRP2601 SIP server to EC2 public IP port 5160, extension 100, then dial 9<DEST>
set -euo pipefail

ROOT="${ROOT:-/opt/vsp-phone-v4}"
cd "$ROOT"

DEST="${DEST:-+17045502033}"
DEST_DIAL="${DEST#+}"
PHONE_IP="${PHONE_IP:-122.177.246.92}"
KAM_SEC="${KAM_SEC:-420}"
AST_HOLD="${AST_HOLD:-90}"
OUT="${OUT:-/tmp/pbx-interop-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT"

TUSER="$(grep -m1 '^TELNYX_SIP_USERNAME=' .env | cut -d= -f2- | tr -d $'\r"')"
TPASS="$(grep -m1 '^TELNYX_SIP_PASSWORD=' .env | cut -d= -f2- | tr -d $'\r"')"
PUB_IP="$(curl -sf --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || grep -m1 '^SIP_PUBLIC_IP=' .env | cut -d= -f2-)"
REG_HOST="$(grep -m1 '^SIP_REGISTRAR_HOST=' .env | cut -d= -f2- | tr -d $'\r"' || echo sip.vspphone.com)"
[ -n "$TUSER" ] && [ -n "$TPASS" ] || { echo "Set TELNYX_SIP_USERNAME/PASSWORD in .env"; exit 1; }

log() { echo "[pbx-interop] $*"; }

# --- Asterisk PJSIP config (UDP 5160 — avoids Kamailio 5060) ---
cat >"$OUT/pjsip.conf" <<EOF
[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5160

[telnyx-reg]
type=registration
outbound_auth=telnyx-auth
server_uri=sip:sip.telnyx.com
client_uri=sip:${TUSER}@sip.telnyx.com
retry_interval=60

[telnyx-auth]
type=auth
auth_type=userpass
username=${TUSER}
password=${TPASS}

[telnyx-endpoint]
type=endpoint
context=from-telnyx
disallow=all
allow=ulaw
outbound_auth=telnyx-auth
aors=telnyx-aor
from_user=+13136506292
from_domain=sip.vspphone.com
callerid="VSP Baseline" <+13136506292>
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
send_pai=yes
trust_id_outbound=yes
send_rpid=yes
trust_id_inbound=yes

[telnyx-aor]
type=aor
contact=sip:sip.telnyx.com

[telnyx-identify]
type=identify
endpoint=telnyx-endpoint
match=192.76.120.0/24
match=64.16.250.0/24
EOF

if [[ "${GS_ASTERISK_DESK:-0}" == "1" ]]; then
  cat >>"$OUT/pjsip.conf" <<EOF

[grandstream-identify]
type=identify
endpoint=gs-endpoint
match=${PHONE_IP}

[gs-endpoint]
type=endpoint
context=from-internal
disallow=all
allow=ulaw
aors=gs-aor
direct_media=no
rtp_symmetric=yes
force_rport=yes

[gs-aor]
type=aor
max_contacts=1
EOF
fi

cat >"$OUT/extensions.conf" <<EOF
[from-internal]
exten => 9.,1,NoOp(Asterisk baseline outbound \${EXTEN:1})
 same => n,Dial(PJSIP/\${EXTEN:1}@telnyx-endpoint,300)
 same => n,Hangup()

[from-telnyx]
exten => _X.,1,Hangup()
EOF

cat >"$OUT/modules.conf" <<'EOF'
[modules]
autoload=yes
noload => chan_sip.so
EOF

log "=== Phase A: Asterisk → Telnyx reference (${AST_HOLD}s hold) ==="
log "OUT=$OUT DEST=$DEST GS_ASTERISK_DESK=${GS_ASTERISK_DESK:-0}"

docker rm -f vsp-asterisk-baseline 2>/dev/null || true

sudo timeout "$((AST_HOLD + 120))" tcpdump -i any -nn -tttt -s0 -w "$OUT/asterisk.pcap" \
  "(port 5060 or port 5070 or port 5160) and (host 192.76.120.10 or host 64.16.250.10 or net 64.16.250.0/24 or host ${PUB_IP} or host ${PHONE_IP})" \
  2>"$OUT/asterisk-tcpdump.err" &
AST_TP=$!

docker run -d --name vsp-asterisk-baseline --network host \
  -v "$OUT/pjsip.conf:/etc/asterisk/pjsip.conf:ro" \
  -v "$OUT/extensions.conf:/etc/asterisk/extensions.conf:ro" \
  -v "$OUT/modules.conf:/etc/asterisk/modules.conf:ro" \
  andrius/asterisk:18-current >/dev/null

sleep 10
docker exec vsp-asterisk-baseline asterisk -rx "module reload res_pjsip.so" 2>&1 | tee "$OUT/asterisk-reload.txt" || true
sleep 5
log "Asterisk PJSIP endpoints:"
docker exec vsp-asterisk-baseline asterisk -rx "pjsip show endpoints" 2>&1 | tee "$OUT/asterisk-endpoints.txt" || true
docker exec vsp-asterisk-baseline asterisk -rx "pjsip show registrations" 2>&1 | tee "$OUT/asterisk-registrations.txt" || true

if [[ "${GS_ASTERISK_DESK:-0}" == "1" ]]; then
  log "GS_ASTERISK_DESK=1 — point GRP2601 SIP server to ${PUB_IP}:5160 ext 100, dial 9${DEST_DIAL}"
  log "Waiting ${AST_HOLD}s for Grandstream → Asterisk → Telnyx call (ACK ownership reference)..."
  sleep "$AST_HOLD"
  docker exec vsp-asterisk-baseline asterisk -rx "pjsip show contacts" 2>&1 | tee "$OUT/asterisk-contacts.txt" || true
  docker exec vsp-asterisk-baseline asterisk -rx "core show channels" 2>&1 | tee "$OUT/asterisk-channels.txt" || true
else
  log "Originating PJSIP/${DEST_DIAL}@telnyx-endpoint ..."
  docker exec vsp-asterisk-baseline asterisk -rx \
    "channel originate PJSIP/${DEST_DIAL}@telnyx-endpoint application Wait ${AST_HOLD}" \
    2>&1 | tee "$OUT/asterisk-originate.txt" || true
  sleep "$((AST_HOLD + 5))"
fi

docker rm -f vsp-asterisk-baseline 2>/dev/null || true
wait "$AST_TP" 2>/dev/null || true

# Prefer carrier-leg Call-ID (Telnyx path) for ACK timing comparison
AST_CALL=$(sudo tcpdump -nn -A -s0 -r "$OUT/asterisk.pcap" 2>/dev/null \
  | grep -E '192\.76\.120\.10|64\.16\.250' | grep -oE 'Call-ID: [^\r\n]+' | head -1 | sed 's/Call-ID: //' || true)
if [[ -z "$AST_CALL" ]]; then
  AST_CALL=$(sudo tcpdump -nn -A -s0 -r "$OUT/asterisk.pcap" 2>/dev/null \
    | grep -oE 'Call-ID: [^\r\n]+' | head -1 | sed 's/Call-ID: //' || true)
fi
echo "$AST_CALL" >"$OUT/asterisk-callid.txt"
log "Asterisk Call-ID: ${AST_CALL:-UNKNOWN}"

# Architecture proof: measure carrier 200→ACK delta (must be ~1ms for true UAC)
python3 - <<'PY' "$OUT/asterisk.pcap" "$OUT/asterisk-ack-timing.txt" 2>"$OUT/asterisk-ack-timing.err" || true
import re, subprocess, sys
pcap, out = sys.argv[1], sys.argv[2]
raw = subprocess.check_output(["sudo","tcpdump","-nn","-tttt","-A","-s0","-r",pcap], stderr=subprocess.DEVNULL).decode("latin1","replace")
blocks = re.split(r"(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+ IP )", raw)
t200 = tacks = None
for b in blocks:
    if "192.76.120.10" not in b and "64.16.250" not in b: continue
    hdr = b.split("\n",1)[0]
    body = b.split("\n",1)[1] if "\n" in b else ""
    ts = " ".join(hdr.split()[0:2]) if hdr else ""
    if "SIP/2.0 200 OK" in body and "INVITE" in body and t200 is None and "> 172." in hdr:
        t200 = ts
    if body.strip().startswith("ACK ") and t200 and ts >= t200 and tacks is None:
        tacks = ts
        break
lines = [f"carrier_200_ts={t200}", f"carrier_ack_ts={tacks}", "ack_ownership=UAC_local" if tacks else "ack_ownership=MISSING"]
open(out,"w").write("\n".join(lines)+"\n")
print("\n".join(lines))
PY

log "=== Phase B: Kamailio Grandstream capture (${KAM_SEC}s) ==="
log "Place Grandstream → Kamailio → PSTN call to ${DEST} now; hold ≥60s (B2BUA path)"

export PHONE_IP SEC="$KAM_SEC"
bash rc1-evidence/capture-teardown.sh 2>&1 | tee "$OUT/kam-capture.log" || true

KAM_CAP=$(grep -oE '/tmp/teardown-capture-[0-9T]+Z' "$OUT/kam-capture.log" | tail -1 || true)
KAM_PCAP=""
[[ -n "$KAM_CAP" && -s "$KAM_CAP/docker.pcap" ]] && KAM_PCAP="$KAM_CAP/docker.pcap"
[[ -z "$KAM_PCAP" && -n "$KAM_CAP" && -s "$KAM_CAP/all.pcap" ]] && KAM_PCAP="$KAM_CAP/all.pcap"

KAM_CALL=""
if [[ -n "$KAM_PCAP" ]]; then
  KAM_CALL=$(sudo tcpdump -nn -A -s0 -r "$KAM_PCAP" 2>/dev/null \
    | grep "$PHONE_IP" | grep -oE '[0-9]+-[0-9]+-[0-9]+@BCC\.BHH\.CEG\.JC' | head -1 || true)
fi
echo "$KAM_CALL" >"$OUT/kamailio-callid.txt"
log "Kamailio Call-ID: ${KAM_CALL:-UNKNOWN} pcap=$KAM_PCAP"

log "=== Phase C: Packet comparison ==="
if [[ -n "$AST_CALL" && -n "$KAM_CALL" && -n "$KAM_PCAP" ]]; then
  python3 rc1-evidence/compare-pbx-ladders.py \
    --ref-pcap "$OUT/asterisk.pcap" --ref-call "$AST_CALL" \
    --kam-pcap "$KAM_PCAP" --kam-call "$KAM_CALL" \
    --phone-ip "$PHONE_IP" \
    --out "$OUT/PBX-INTEROP-COMPARISON.md" \
    2>"$OUT/compare.err" || true
  log "Report: $OUT/PBX-INTEROP-COMPARISON.md"
  head -40 "$OUT/PBX-INTEROP-COMPARISON.md" 2>/dev/null || true
else
  log "SKIP compare — need both Call-IDs and pcaps"
  log "  asterisk_call=${AST_CALL:-missing} kam_call=${KAM_CALL:-missing} kam_pcap=${KAM_PCAP:-missing}"
fi

log "Done — artifacts in $OUT"
