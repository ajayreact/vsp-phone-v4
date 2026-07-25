#!/bin/bash
set -euo pipefail
cd /opt/vsp-phone-v4

echo "=== git pull ==="
git pull

echo "=== verify TELNYX_SIP_PASSWORD matches Telnyx credential_connections (set in .env before running) ==="
cp .env /tmp/.env.bak.$(date +%s)
: "${TELNYX_SIP_PASSWORD:?export TELNYX_SIP_PASSWORD from Telnyx portal or credential_connections API first}"
grep -m1 '^TELNYX_SIP_PASSWORD=' .env | sed 's/PASSWORD=.*/PASSWORD=<redacted, len='"$(grep -m1 '^TELNYX_SIP_PASSWORD=' .env | cut -d= -f2- | wc -c)"'>/'

echo "=== rebuild kamailio image ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env build kamailio

echo "=== recreate kamailio container ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env up -d --no-deps --force-recreate kamailio

sleep 3
echo "=== container status ==="
docker ps --filter name=vsp-kamailio --format '{{.Names}}  {{.Status}}'

echo "=== confirm credential injected (no secrets printed) ==="
docker logs vsp-kamailio 2>&1 | grep -i "Telnyx UAC credential" || echo "WARNING: injection confirmation line not found"
