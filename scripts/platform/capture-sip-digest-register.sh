#!/usr/bin/env bash
# RC1 — capture REAL REGISTER → sip-digest body + NestJS response (runtime evidence).
# Run on EC2: bash scripts/platform/capture-sip-digest-register.sh
set -euo pipefail

cd /opt/vsp-phone-v4
source scripts/platform/ec2-compose-env.sh

echo "=== 1. Ensure RC1 trace enabled in kamailio.cfg ==="
grep -q 'RC1_SIP_DIGEST_TRACE' infrastructure/kamailio/kamailio.cfg || {
  echo "ERROR: RC1_SIP_DIGEST_TRACE not in kamailio.cfg — git pull latest release/v4.0.0-rc1"
  exit 1
}

echo "=== 2. Recreate kamailio + api (cfg mounted / api logging) ==="
$COMPOSE up -d --no-deps --force-recreate kamailio api
sleep 15

echo "=== 3. Trigger REGISTER from Grandstream (extension 100), then press Enter ==="
read -r _

echo "=== 4. Kamailio — exact JSON body + NestJS response ==="
$COMPOSE logs kamailio --since 2m 2>&1 | grep -E 'RC1 sip-digest (request|response)|REGISTER aor=' || true

echo ""
echo "=== 5. API — exception (file/line via stack in logs) ==="
$COMPOSE logs api --since 2m 2>&1 | grep -E 'telecom\.(error|sip-digest\.pre_filter)' || true

echo ""
echo "=== 6. Optional: replay last captured body from Kamailio log ==="
BODY=$($COMPOSE logs kamailio --since 5m 2>&1 | grep 'RC1 sip-digest request' | tail -1 | sed -n 's/.* body=\(.*\)$/\1/p')
if [[ -n "${BODY:-}" ]]; then
  TOKEN=$(grep '^TELECOM_SERVICE_AUTH_TOKEN=' .env | cut -d= -f2-)
  echo "Replay body: $BODY"
  $COMPOSE exec kamailio curl -sS -i \
    -X POST http://api:3000/api/v1/telecom/auth/sip-digest \
    -H "Content-Type: application/json" \
    -H "X-VSP-Service-Auth: $TOKEN" \
    --data-binary "$BODY"
else
  echo "No RC1 sip-digest request line in last 5m — REGISTER may not have reached digest auth."
fi
