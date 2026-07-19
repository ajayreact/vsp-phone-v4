#!/usr/bin/env bash
# RC1: fix API :3000 hang + prov-edge :3444 504 (runtime only).
# Run on EC2: bash scripts/platform/ec2-fix-api-prov-runtime.sh
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
cd "$REPO_ROOT"

# shellcheck disable=SC1091
source scripts/platform/ec2-compose-env.sh

echo "==> Sync Let's Encrypt → /etc/vsp/tls/prov (via host bind)"
bash scripts/platform/sync-le-prov-tls.sh

echo "==> Ensure .env does not force Nest HTTPS / development TLS_ENV"
if grep -qE '^TLS_ENABLED=' .env 2>/dev/null; then
  sed -i 's/^TLS_ENABLED=.*/TLS_ENABLED=false/' .env
else
  echo 'TLS_ENABLED=false' >> .env
fi
if grep -qE '^TLS_ENV=' .env 2>/dev/null; then
  sed -i 's/^TLS_ENV=.*/TLS_ENV=production/' .env
else
  echo 'TLS_ENV=production' >> .env
fi
if grep -qE '^TLS_TERMINATION=' .env 2>/dev/null; then
  sed -i 's/^TLS_TERMINATION=.*/TLS_TERMINATION=nginx/' .env
else
  echo 'TLS_TERMINATION=nginx' >> .env
fi

echo "==> Recreate API (pick up TLS mounts + plain HTTP listener)"
$COMPOSE up -d --force-recreate api

echo "==> Wait for health"
ok=0
for i in $(seq 1 36); do
  if curl -sS -m 5 http://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"status":"ok"'; then
    ok=1
    break
  fi
  sleep 5
done
if [[ "$ok" != "1" ]]; then
  echo "ERROR: API /api/health still failing" >&2
  $COMPOSE logs --tail=80 api
  exit 1
fi

echo "==> Discriminate HTTP vs HTTPS vs wedge (in-container)"
$COMPOSE exec -T api node -e '
Promise.all([
  fetch("http://127.0.0.1:3000/api/health").then((r) => r.status).catch((e) => "ERR:" + (e.cause && e.cause.code || e.message)),
  fetch("https://127.0.0.1:3000/api/health").then((r) => r.status).catch((e) => "ERR:" + (e.cause && e.cause.code || e.message)),
]).then(([h, s]) => {
  console.log(JSON.stringify({ http: h, https: s }));
  if (h !== 200) process.exit(2);
});
'

echo "==> Logs (api.started / prov.edge)"
$COMPOSE logs --tail=120 api | grep -E 'api.started|prov.edge|bootstrap.failed' || true

echo "==> Ports"
ss -lntp | grep -E ':3000|:3444' || true

echo "==> Prov edge"
curl -sS -m 5 -k https://127.0.0.1:3444/health
echo
curl -sS -m 15 -o /dev/null -w "prov.public=%{http_code}\n" https://prov.vspphone.com/health
curl -sS -m 10 -o /dev/null -w "api.public=%{http_code}\n" https://api.vspphone.com/api/health

echo "==> Done"
