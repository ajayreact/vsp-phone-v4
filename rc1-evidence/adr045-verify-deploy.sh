#!/usr/bin/env bash
# ADR-045 post-deploy gates. Run on EC2 from /opt/vsp-phone-v4 AFTER `docker compose up -d`.
#
#   sudo bash rc1-evidence/adr045-verify-deploy.sh
#
# Prints one line per gate and exits non-zero if any gate fails. Passing these gates does
# NOT mean the 32 s teardown is fixed — only the call in adr045-capture.sh can show that.
set -uo pipefail

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
SOCKS=$(docker exec vsp-kamailio sh -c 'ss -lnup 2>/dev/null || netstat -lnup 2>/dev/null' | awk '{print $5}' | grep -oE ':(5060|5070)$' | sort -u | tr '\n' ' ')
case "$SOCKS" in
  *:5060*) ok "public socket 5060 bound" ;;
  *)       bad "public socket 5060 not bound" ;;
esac
case "$SOCKS" in
  *:5070*) ok "internal socket 5070 bound" ;;
  *)       bad "internal socket 5070 not bound" ;;
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

hdr "D7 Kamailio -> Asterisk SIP reachability"
KAM_PROBE=$(docker exec vsp-kamailio sh -c "printf 'OPTIONS sip:probe@asterisk:5080 SIP/2.0\r\nVia: SIP/2.0/UDP ${KAM_IP}:5070;branch=z9hG4bK-adr045-k;rport\r\nMax-Forwards: 70\r\nFrom: <sip:probe@${KAM_IP}>;tag=adr045k\r\nTo: <sip:probe@asterisk>\r\nCall-ID: adr045-kam-probe\r\nCSeq: 1 OPTIONS\r\nContent-Length: 0\r\n\r\n' | nc -u -w 3 asterisk 5080" 2>/dev/null | head -1)
if printf '%s' "$KAM_PROBE" | grep -q 'SIP/2.0 2'; then
  ok "Kamailio -> Asterisk OPTIONS answered: $(printf '%s' "$KAM_PROBE" | tr -d '\r')"
else
  bad "Kamailio -> Asterisk OPTIONS unanswered (got: '$(printf '%s' "$KAM_PROBE" | tr -d '\r')')"
fi

hdr "D8 Asterisk -> Kamailio SIP reachability"
AST_PROBE=$(docker exec vsp-asterisk sh -c "printf 'OPTIONS sip:probe@kamailio:5070 SIP/2.0\r\nVia: SIP/2.0/UDP ${AST_IP}:5080;branch=z9hG4bK-adr045-a;rport\r\nMax-Forwards: 70\r\nFrom: <sip:probe@${AST_IP}>;tag=adr045a\r\nTo: <sip:probe@kamailio>\r\nCall-ID: adr045-ast-probe\r\nCSeq: 1 OPTIONS\r\nContent-Length: 0\r\n\r\n' | nc -u -w 3 kamailio 5070" 2>/dev/null | head -1)
if printf '%s' "$AST_PROBE" | grep -q 'SIP/2.0 2'; then
  ok "Asterisk -> Kamailio OPTIONS answered: $(printf '%s' "$AST_PROBE" | tr -d '\r')"
else
  bad "Asterisk -> Kamailio OPTIONS unanswered (got: '$(printf '%s' "$AST_PROBE" | tr -d '\r')')"
fi

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
