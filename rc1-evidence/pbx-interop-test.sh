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
log "OUT=$OUT DEST=$DEST"

docker rm -f vsp-asterisk-baseline 2>/dev/null || true

sudo timeout "$((AST_HOLD + 60))" tcpdump -i any -nn -tttt -s0 -w "$OUT/asterisk.pcap" \
  "(port 5060 or port 5070 or port 5160) and (host 192.76.120.10 or host 64.16.250.10 or net 64.16.250.0/24 or host ${PUB_IP})" \
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

log "Originating PJSIP/${DEST_DIAL}@telnyx-endpoint ..."
docker exec vsp-asterisk-baseline asterisk -rx \
  "channel originate PJSIP/${DEST_DIAL}@telnyx-endpoint application Wait ${AST_HOLD}" \
  2>&1 | tee "$OUT/asterisk-originate.txt" || true

sleep "$((AST_HOLD + 5))"
docker rm -f vsp-asterisk-baseline 2>/dev/null || true
wait "$AST_TP" 2>/dev/null || true

AST_CALL=$(sudo tcpdump -nn -A -s0 -r "$OUT/asterisk.pcap" 2>/dev/null \
  | grep -oE '[0-9a-f]{8,}-[0-9]+-[0-9]+@BCC\.BHH\.[A-Z]{3}\.[A-Z]{3}' | head -1 || true)
if [[ -z "$AST_CALL" ]]; then
  AST_CALL=$(sudo tcpdump -nn -A -s0 -r "$OUT/asterisk.pcap" 2>/dev/null \
    | grep -oE 'Call-ID: [^\r\n]+' | head -1 | sed 's/Call-ID: //' || true)
fi
echo "$AST_CALL" >"$OUT/asterisk-callid.txt"
log "Asterisk Call-ID: ${AST_CALL:-UNKNOWN}"

log "=== Phase B: Kamailio Grandstream capture (${KAM_SEC}s) ==="
log "Place Grandstream → PSTN call to ${DEST} now; hold through answer ≥60s"

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
