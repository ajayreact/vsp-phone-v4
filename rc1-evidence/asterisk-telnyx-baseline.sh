#!/usr/bin/env bash
# Reference capture: Asterisk → Telnyx (same trunk credential as Kamailio).
# Produces pcap for side-by-side ACK comparison with extract-sip-ladder.py.
set -euo pipefail
ROOT="${ROOT:-/opt/vsp-phone-v4}"
OUT="${OUT:-/tmp/asterisk-telnyx-baseline-$(date -u +%Y%m%dT%H%M%SZ)}"
SEC="${SEC:-420}"
DEST="${DEST:-+17045502033}"
mkdir -p "$OUT"

cd "$ROOT"
TUSER="$(grep -m1 '^TELNYX_SIP_USERNAME=' .env | cut -d= -f2- | tr -d $'\r"')"
TPASS="$(grep -m1 '^TELNYX_SIP_PASSWORD=' .env | cut -d= -f2- | tr -d $'\r"')"
[ -n "$TUSER" ] && [ -n "$TPASS" ] || { echo "Set TELNYX_SIP_USERNAME/PASSWORD in .env"; exit 1; }

cat >"$OUT/pjsip.conf" <<EOF
[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5160

[telnyx]
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

[telnyx-aor]
type=aor
contact=sip:sip.telnyx.com

[telnyx-identify]
type=identify
endpoint=telnyx-endpoint
match=192.76.120.0/24
match=64.16.250.0/24
EOF

cat >"$OUT/extensions.conf" <<EOF
[from-internal]
exten => 9.,1,NoOp(Baseline outbound \${EXTEN:1})
 same => n,Dial(PJSIP/\${EXTEN:1}@telnyx-endpoint,300)
 same => n,Hangup()
EOF

echo "[baseline] Starting Asterisk + capture ($SEC s) → $OUT"
docker rm -f vsp-asterisk-baseline 2>/dev/null || true
sudo timeout "$SEC" tcpdump -i any -nn -tttt -s0 -w "$OUT/all.pcap" \
  "port 5060 or port 5070 or port 5160" 2>"$OUT/tcpdump.err" &
TPID=$!

docker run -d --name vsp-asterisk-baseline --network host \
  -v "$OUT/pjsip.conf:/etc/asterisk/pjsip.d/telnyx.conf:ro" \
  -v "$OUT/extensions.conf:/etc/asterisk/extensions.conf:ro" \
  andrius/asterisk:18-current >/dev/null

sleep 8
echo "[baseline] Dial from Asterisk CLI: channel originate PJSIP/${DEST#+}@telnyx-endpoint application Wait 300"
echo "[baseline] Run: docker exec -it vsp-asterisk-baseline asterisk -rx 'channel originate PJSIP/${DEST#+}@telnyx-endpoint application Wait 300'"
wait "$TPID" || true
docker rm -f vsp-asterisk-baseline 2>/dev/null || true
echo "[baseline] Done — analyze: python3 rc1-evidence/extract-sip-ladder.py $OUT/all.pcap <Call-ID>"
