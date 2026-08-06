#!/usr/bin/env bash
# ADR-045 post-deploy gates. Run on EC2 from /opt/vsp-phone-v4 AFTER `docker compose up -d`.
#
#   sudo bash rc1-evidence/adr045-verify-deploy.sh
#
# Prints one line per gate and exits non-zero if any gate fails. Passing these gates does
# NOT mean the 32 s teardown is fixed — only the call in adr045-capture.sh can show that.
#
# Deliberately no `pipefail`: `docker logs | grep -q` makes grep exit on the first match,
# which SIGPIPEs docker and turns a successful match into a failed pipeline.
set -u

PASS=0
FAIL=0
SKIP=0

ok()   { printf '  [PASS] %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  [FAIL] %s\n' "$1"; FAIL=$((FAIL+1)); }
info() { printf '  [INFO] %s\n' "$1"; SKIP=$((SKIP+1)); }
hdr()  { printf '\n== %s ==\n' "$1"; }

if [ -f scripts/platform/ec2-compose-env.sh ]; then
  # shellcheck disable=SC1091
  . scripts/platform/ec2-compose-env.sh
fi
COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env}"

hdr "D1 compose configuration parses and includes asterisk"
if CFG=$($COMPOSE config 2>&1); then
  ok "compose config valid"
  if printf '%s' "$CFG" | grep -qE '^\s{2}asterisk:'; then
    ok "asterisk service present in the merged configuration"
  else
    bad "asterisk service missing from the merged configuration"
  fi
else
  bad "compose config failed: $(printf '%s' "$CFG" | tail -3)"
fi

hdr "D2 containers running"
for c in vsp-kamailio vsp-asterisk vsp-rtpengine; do
  STATE=$(docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}nohealth{{end}}' "$c" 2>/dev/null)
  case "$STATE" in
    running/healthy)  ok  "$c $STATE" ;;
    running/nohealth) ok  "$c running (no healthcheck)" ;;
    running/*)        bad "$c $STATE — inspect: docker logs $c --tail=80" ;;
    *)                bad "$c not running ($STATE)" ;;
  esac
done

hdr "D3 Kamailio bound both SIP sockets"
# The Kamailio image ships neither ss nor netstat, so read procfs directly. Local ports
# are big-endian hex there: 5060 = 13C4, 5070 = 13CE.
UDPHEX=$(docker exec vsp-kamailio sh -c 'cat /proc/net/udp /proc/net/udp6 2>/dev/null' \
  | awk 'NR>1 { split($2, a, ":"); print toupper(a[2]) }' | sort -u | tr '\n' ' ')
case " $UDPHEX " in
  *" 13C4 "*) ok "public socket 5060/udp bound" ;;
  *)          bad "public socket 5060/udp not bound (listening: $UDPHEX)" ;;
esac
case " $UDPHEX " in
  *" 13CE "*) ok "internal socket 5070/udp bound" ;;
  *)          bad "internal socket 5070/udp not bound (listening: $UDPHEX)" ;;
esac

KAM_IP=$(docker inspect -f '{{.NetworkSettings.Networks.vsp_internal.IPAddress}}' vsp-kamailio 2>/dev/null)
AST_IP=$(docker inspect -f '{{.NetworkSettings.Networks.vsp_internal.IPAddress}}' vsp-asterisk 2>/dev/null)
[ -n "$KAM_IP" ] && ok "kamailio container ip $KAM_IP" || bad "cannot read kamailio container ip"
[ -n "$AST_IP" ] && ok "asterisk container ip $AST_IP" || bad "cannot read asterisk container ip"

if docker logs vsp-kamailio 2>&1 | grep -q "internal socket=${KAM_IP}:5070"; then
  ok "internal socket advertises the container address (required for Route hops)"
else
  bad "internal socket advertise address does not match ${KAM_IP}:5070"
  docker logs vsp-kamailio 2>&1 | grep -E 'B2BUA core|internal socket' | tail -3
fi

hdr "D4 Kamailio config rendered and accepted"
if docker logs vsp-kamailio 2>&1 | grep -q 'configuration OK'; then
  ok "kamailio -c lint passed at start-up"
else
  bad "kamailio start-up lint did not report OK"
fi
if docker logs vsp-kamailio 2>&1 | grep -q 'unresolved placeholders'; then
  bad "kamailio reported unresolved config placeholders"
else
  ok "no unresolved config placeholders"
fi

hdr "D5 Asterisk configuration"
if docker exec vsp-asterisk grep -q '__' /etc/asterisk/pjsip.conf 2>/dev/null; then
  bad "pjsip.conf still contains unrendered placeholders"
else
  ok "pjsip.conf fully rendered"
fi
EP=$(docker exec vsp-asterisk asterisk -rx 'pjsip show endpoints' 2>/dev/null)
for e in kamailio telnyx; do
  if printf '%s' "$EP" | grep -qE "Endpoint: +$e"; then
    ok "pjsip endpoint '$e' loaded"
  else
    bad "pjsip endpoint '$e' missing"
  fi
done
IDENT=$(docker exec vsp-asterisk asterisk -rx 'pjsip show identifies' 2>/dev/null)
if printf '%s' "$IDENT" | grep -q 'kamailio'; then
  ok "edge identify object loaded: $(printf '%s' "$IDENT" | grep -i 'match' | head -1 | tr -s ' ')"
else
  bad "kamailio-identify did not load — Asterisk will answer 401 to every edge request"
  printf '%s\n' "$IDENT" | sed 's/^/        /'
fi

if docker exec vsp-asterisk asterisk -rx 'dialplan show vsp-outbound' 2>/dev/null | grep -q 'vsp-pstn'; then
  ok "dialplan context vsp-outbound routes to vsp-pstn"
else
  bad "dialplan context vsp-outbound not loaded"
fi
AUTH=$(docker exec vsp-asterisk asterisk -rx 'pjsip show auth telnyx-auth' 2>/dev/null)
if printf '%s' "$AUTH" | grep -qi 'username'; then
  ok "telnyx trunk auth object present"
else
  bad "telnyx trunk auth object missing — outbound 407 will not be answered"
fi

hdr "D6 RTPengine interfaces"
RLOG=$(docker logs vsp-rtpengine 2>&1 | tail -80)
if printf '%s' "$RLOG" | grep -q 'external interface advertises'; then
  ok "$(printf '%s' "$RLOG" | grep 'external interface advertises' | tail -1 | sed 's/^\[rtpengine\] //')"
else
  bad "rtpengine did not report an advertised external interface (media will use a private IP)"
fi

# The probe binds a known source port and puts it in the Via sent-by. Neither peer has
# yet applied force_rport to a bare `;rport`, so a reply is addressed to the Via literally;
# with an ephemeral source port the answer would go to a socket nc is not holding.
sip_probe() { # sip_probe <container> <src-ip> <src-port> <dst-host> <dst-port> <tag>
  docker exec "$1" sh -c "printf 'OPTIONS sip:probe@$4:$5 SIP/2.0\r\nVia: SIP/2.0/UDP $2:$3;branch=z9hG4bK-adr045-$6;rport\r\nMax-Forwards: 70\r\nFrom: <sip:probe@$2>;tag=adr045$6\r\nTo: <sip:probe@$4>\r\nCall-ID: adr045-probe-$6\r\nCSeq: 1 OPTIONS\r\nContent-Length: 0\r\n\r\n' | nc -u -p $3 -w 3 $4 $5" 2>/dev/null | head -1 | tr -d '\r'
}

hdr "D7 Kamailio -> Asterisk SIP reachability"
KAM_PROBE=$(sip_probe vsp-kamailio "$KAM_IP" 45071 asterisk 5080 k)
case "$KAM_PROBE" in
  "SIP/2.0 2"*)
    ok "Kamailio -> Asterisk OPTIONS answered: $KAM_PROBE" ;;
  "SIP/2.0 401"*|"SIP/2.0 407"*)
    bad "Asterisk reachable but does NOT identify the edge ($KAM_PROBE) — it will challenge every INVITE"
    docker exec vsp-asterisk asterisk -rx 'pjsip show identifies' 2>&1 | sed 's/^/        /'
    docker logs vsp-asterisk 2>&1 | grep -iE 'identif|did not resolve' | tail -5 | sed 's/^/        /' ;;
  "")
    bad "Kamailio -> Asterisk OPTIONS unanswered (no reply)" ;;
  *)
    bad "Kamailio -> Asterisk OPTIONS rejected: $KAM_PROBE" ;;
esac

hdr "D8 Asterisk -> Kamailio SIP reachability"
AST_PROBE=$(sip_probe vsp-asterisk "$AST_IP" 45081 "$KAM_IP" 5070 a)
case "$AST_PROBE" in
  "SIP/2.0 2"*) ok  "Asterisk -> Kamailio OPTIONS answered: $AST_PROBE" ;;
  "")           bad "Asterisk -> Kamailio OPTIONS unanswered (no reply)" ;;
  *)            bad "Asterisk -> Kamailio OPTIONS rejected: $AST_PROBE" ;;
esac

hdr "D9 Kamailio -> Telnyx carrier path"
DS=$(docker exec vsp-kamailio kamcmd dispatcher.list 2>/dev/null)
if [ -n "$DS" ]; then
  ok "dispatcher set loaded"
  printf '%s\n' "$DS" | grep -E 'URI|FLAGS|DEST' | head -20 | sed 's/^/        /'
else
  bad "kamcmd dispatcher.list returned nothing"
fi
info "Telnyx does not answer unsolicited OPTIONS from this trunk; definitive reachability is the 100/407 from Telnyx during the test call (gate C3 in adr045-analyze.sh)"

hdr "D10 Asterisk is not reachable from outside the Docker network"
PORTS=$(docker port vsp-asterisk 2>/dev/null)
if [ -z "$PORTS" ]; then
  ok "vsp-asterisk publishes no host ports"
else
  bad "vsp-asterisk publishes host ports: $PORTS"
fi
if ss -lnu 2>/dev/null | grep -qE ':5080\b'; then
  bad "host is listening on udp/5080"
else
  ok "host has no udp/5080 listener"
fi
if ss -lnu 2>/dev/null | awk '{print $5}' | grep -qE ':2[0-9]{4}$'; then
  info "host has a listener in the 20000-29999 range — confirm it is not asterisk RTP: ss -lnup | grep -E ':2[0-9]{4}'"
else
  ok "host has no asterisk RTP listener"
fi
if docker port vsp-kamailio 2>/dev/null | grep -q '5070'; then
  bad "kamailio publishes the internal 5070 socket to the host"
else
  ok "kamailio 5070 is Docker-internal only"
fi

hdr "D11 X-VSP-Egress cannot be exploited from the public socket"
if command -v python3 >/dev/null 2>&1; then
  SPOOF=$(python3 rc1-evidence/adr045-egress-spoof-test.py 127.0.0.1 5060 2>&1 | tail -3)
  printf '%s\n' "$SPOOF" | sed 's/^/        /'
  if printf '%s' "$SPOOF" | grep -q 'RESULT=BLOCKED'; then
    ok "public-socket INVITE carrying X-VSP-Egress was rejected"
  else
    bad "public-socket INVITE carrying X-VSP-Egress was NOT rejected — toll fraud exposure"
  fi
else
  info "python3 unavailable; run the spoof test manually"
fi

printf '\n===============================\n'
printf 'gates: %d pass, %d fail, %d informational\n' "$PASS" "$FAIL" "$SKIP"
if [ "$FAIL" -gt 0 ]; then
  printf 'DEPLOY GATES FAILED — do not place the validation call yet.\n'
  exit 1
fi
printf 'Deploy gates pass. This proves the stack is wired correctly.\n'
printf 'It does NOT prove the 32 s teardown is fixed — run adr045-capture.sh next.\n'
