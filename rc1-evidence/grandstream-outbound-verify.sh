#!/usr/bin/env bash
# RC1 — verify Grandstream outbound fix on EC2 after rebuild api + kamailio.
set -euo pipefail

COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env}"
EXT="${EXT:-100}"

echo "=== RC1 Grandstream outbound verification (ext ${EXT}) ==="
echo "1) Rebuild and restart api + kamailio"
$COMPOSE build api kamailio
$COMPOSE up -d api kamailio
sleep 8
$COMPOSE ps api kamailio

echo
echo "2) Confirm new Kamailio markers exist in runtime cfg"
docker exec vsp-kamailio grep -c RC1_INVITE_COMPARE /tmp/kamailio.runtime.cfg || true
docker exec vsp-kamailio grep -c route\\[DESK_REPLY\\] /tmp/kamailio.runtime.cfg || true

echo
echo "3) Place ONE Grandstream outbound PSTN call now, then press Enter"
read -r _

echo
echo "=== Kamailio (last 60 lines matching ext ${EXT} / RC1 markers) ==="
docker logs vsp-kamailio 2>&1 | grep -E "RC1_REG_|RC1_INVITE_|RC1_DESK|RC1_ROUTE|BRIDGE_CARRIER|ext ${EXT}|from_user=${EXT}|auth_user=${EXT}" | tail -60 || true

echo
echo "=== API routing identity (last 40 lines) ==="
docker logs vsp-api 2>&1 | grep -E "telecom\\.route\\.invite_identity|telecom\\.route\\.lookup\\.registration|telecom\\.reg\\.identity|telecom\\.route\\.resolve\\.outbound" | tail -40 || true

echo
echo "Expected success path:"
echo "  RC1_REG_COMPARE + RC1_REG_IDENTITY on REGISTER"
echo "  RC1_INVITE_COMPARE + RC1_INVITE_IDENTITY + RC1_ROUTE_DECISION action=BRIDGE_CARRIER on INVITE"
echo "  API lookupPath registration|authUsername|aor + routingDecision ACCEPT_CALLER"
echo "  INVITE BRIDGE_CARRIER cli=+... from_rewritten=1"
