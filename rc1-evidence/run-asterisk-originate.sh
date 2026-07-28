#!/usr/bin/env bash
# Run Asterisk PJSIP outbound originate with capture (called on EC2).
set -euo pipefail
ROOT="${ROOT:-/opt/vsp-phone-v4}"
cd "$ROOT"
OUT="${OUT:-/tmp/asterisk-ref-$(date -u +%Y%m%dT%H%M%SZ)}"
SEC="${SEC:-90}"
DEST="${DEST:-+17045502033}"
DEST_DIAL="${DEST#+}"
mkdir -p "$OUT"

TUSER="$(grep -m1 '^TELNYX_SIP_USERNAME=' .env | cut -d= -f2- | tr -d $'\r"')"
TPASS="$(grep -m1 '^TELNYX_SIP_PASSWORD=' .env | cut -d= -f2- | tr -d $'\r"')"

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

cat >"$OUT/extensions.conf" <<'EOF'
[from-internal]
exten => _X.,1,Hangup()
[from-telnyx]
exten => _X.,1,Hangup()
EOF

cat >"$OUT/modules.conf" <<'EOF'
[modules]
autoload=yes
noload => chan_sip.so
EOF

docker rm -f vsp-asterisk-baseline 2>/dev/null || true
CAP_IF="${CAP_IF:-ens5}"
sudo timeout "$SEC" tcpdump -i "$CAP_IF" -nn -tttt -s0 -w "$OUT/all.pcap" \
  "(port 5160 or port 5060 or port 5070) and (host 192.76.120.10 or host 64.16.250.10 or net 64.16.250.0/24)" \
  2>"$OUT/tcpdump.err" &
TP=$!

docker run -d --name vsp-asterisk-baseline --network host \
  -v "$OUT/pjsip.conf:/etc/asterisk/pjsip.conf:ro" \
  -v "$OUT/extensions.conf:/etc/asterisk/extensions.conf:ro" \
  -v "$OUT/modules.conf:/etc/asterisk/modules.conf:ro" \
  andrius/asterisk:18-current >/dev/null

sleep 15
docker exec vsp-asterisk-baseline asterisk -rx "module reload res_pjsip.so" 2>&1 | tee -a "$OUT/reload.txt" || true
docker exec vsp-asterisk-baseline asterisk -rx "pjsip show endpoints" 2>&1 | tee "$OUT/endpoints.txt"
docker exec vsp-asterisk-baseline asterisk -rx "pjsip show registrations" 2>&1 | tee "$OUT/registrations.txt"
docker exec vsp-asterisk-baseline asterisk -rx \
  "channel originate PJSIP/${DEST_DIAL}@telnyx-endpoint application Wait 60" \
  2>&1 | tee "$OUT/originate.txt"

sleep 65
docker rm -f vsp-asterisk-baseline 2>/dev/null || true
wait "$TP" 2>/dev/null || true

PKTS=$(sudo tcpdump -nn -r "$OUT/all.pcap" 2>/dev/null | wc -l)
echo "packets=$PKTS out=$OUT"
sudo tcpdump -nn -r "$OUT/all.pcap" 2>/dev/null | grep -iE 'INVITE|ACK|200 OK|BYE|407' | head -25 | tee "$OUT/summary.txt"
CALL=$(sudo tcpdump -nn -A -s0 -r "$OUT/all.pcap" 2>/dev/null | awk '/INVITE sip:/{found=1} found && /Call-ID:/{print $2; exit}' || true)
if [[ -z "$CALL" ]]; then
  CALL=$(sudo tcpdump -nn -A -s0 -r "$OUT/all.pcap" 2>/dev/null | grep -oE 'Call-ID: [0-9a-f-]{36}' | grep -v REGISTER | head -1 | sed 's/Call-ID: //' || true)
fi
echo "callid=$CALL" | tee "$OUT/callid.txt"
echo "$OUT"
