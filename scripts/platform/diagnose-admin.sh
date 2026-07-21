#!/usr/bin/env bash
# Admin-only live diagnosis — run on EC2. Paste FULL output back.
set -uo pipefail
cd "${REPO_ROOT:-/opt/vsp-phone-v4}"
# shellcheck disable=SC1091
source scripts/platform/ec2-compose-env.sh

echo '===== 1 ADMIN PS ====='
$COMPOSE ps admin
docker ps -a --filter name=vsp-admin --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo '===== 2 ADMIN LOGS (tail 300) ====='
$COMPOSE logs admin --tail=300

echo '===== 3 LISTEN INSIDE CONTAINER ====='
docker exec vsp-admin sh -c 'command -v ss >/dev/null && ss -lntp || netstat -lntp 2>/dev/null || (apt-get update -qq && apt-get install -y -qq iproute2 >/dev/null && ss -lntp)' 2>&1 || echo 'EXEC_FAILED (container not running?)'

echo '===== 4 INSPECT PORTS / NETWORK ====='
docker inspect vsp-admin --format 'Status={{.State.Status}} ExitCode={{.State.ExitCode}} OOM={{.State.OOMKilled}} Error={{.State.Error}}'
docker inspect vsp-admin --format 'Ports={{json .NetworkSettings.Ports}}'
docker inspect vsp-admin --format 'Networks={{range $k,$v := .NetworkSettings.Networks}}{{$k}} aliases={{json $v.Aliases}} {{end}}'
docker inspect vsp-admin --format '{{range .Config.Env}}{{println .}}{{end}}' | sort | grep -E '^(PORT|HOSTNAME|NODE_ENV|VSP_ENV|NEXT_PUBLIC_|API_INTERNAL|ADMIN_)=' || true

echo '===== 5 HOST :3001 ====='
ss -lntp | grep ':3001' || echo 'NOTHING_LISTENING_ON_HOST_3001'
curl -sv --connect-timeout 3 http://127.0.0.1:3001/login -o /dev/null 2>&1 | tail -20 || true

echo '===== 6 NGINX UPSTREAM ====='
sudo nginx -T 2>/dev/null | grep -E 'upstream vsp_admin|server 127.0.0.1:3001|server_name (admin|tenant|app)\.|proxy_pass http://vsp_admin' || true
