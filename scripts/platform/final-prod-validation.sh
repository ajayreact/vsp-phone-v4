#!/usr/bin/env bash
# FINAL production deployment validation — run on EC2 in /opt/vsp-phone-v4
# Usage: bash scripts/platform/final-prod-validation.sh
set -euo pipefail
cd "${REPO_ROOT:-/opt/vsp-phone-v4}"

fail() { echo "FAIL: $*"; exit 1; }
pass() { echo "PASS: $*"; }

echo "=== 1) Commits on release/v4.0.0-rc1 ==="
git fetch origin release/v4.0.0-rc1 >/dev/null 2>&1 || true
git rev-parse --abbrev-ref HEAD | grep -qx 'release/v4.0.0-rc1' || fail "not on release/v4.0.0-rc1"
git merge-base --is-ancestor bbc7830 HEAD || fail "bbc7830 not in history"
git merge-base --is-ancestor d81e8ef HEAD || fail "d81e8ef not in history"
pass "bbc7830 and d81e8ef are ancestors of HEAD ($(git rev-parse --short HEAD))"

echo "=== 2) Deploy files present ==="
for f in \
  docker-compose.yml \
  docker-compose.prod.yml \
  docker-compose.host-db.yml \
  scripts/platform/ec2-compose-env.sh \
  scripts/platform/compose-config-audit.cjs \
  static/runtime-verification/EC2_DEPLOY_RUNBOOK.md
do
  [[ -f "$f" ]] || fail "missing $f"
done
pass "all deployment files present"

echo "=== 3) Effective compose config ==="
# shellcheck disable=SC1091
source scripts/platform/ec2-compose-env.sh
$COMPOSE config > /tmp/vsp-compose.effective.yml
grep -q 'postgres:5432' /tmp/vsp-compose.effective.yml || fail "DATABASE_URL host is not postgres:5432"
grep -q 'vsp_phone_v4' /tmp/vsp-compose.effective.yml || fail "database name vsp_phone_v4 not in config"
grep -q 'KAMAILIO_HTTP_HOST: kamailio' /tmp/vsp-compose.effective.yml \
  || grep -q 'KAMAILIO_HTTP_HOST=kamailio' /tmp/vsp-compose.effective.yml \
  || fail "KAMAILIO_HTTP_HOST != kamailio"
grep -q 'RTPENGINE_HOST: rtpengine' /tmp/vsp-compose.effective.yml \
  || grep -q 'RTPENGINE_HOST=rtpengine' /tmp/vsp-compose.effective.yml \
  || fail "RTPENGINE_HOST != rtpengine"
grep -q 'redis://redis:6379' /tmp/vsp-compose.effective.yml || fail "REDIS_URL is not redis://redis:6379"
grep -qi 'vsp_voip' /tmp/vsp-compose.effective.yml && fail "legacy vsp_voip still in effective config" || true
pass "effective compose hosts/db look correct"

echo "=== 4) Recreate affected containers (ordered) ==="
$COMPOSE up -d postgres redis
$COMPOSE up -d rtpengine kamailio
$COMPOSE up -d --build --force-recreate api admin

echo "=== 5) Injected env inside api ==="
ENV_OUT="$(docker inspect vsp-api --format '{{range .Config.Env}}{{println .}}{{end}}')"
echo "$ENV_OUT" | grep '^DATABASE_URL=' | sed -E 's#://[^:]+:[^@]+@#://***:***@#'
echo "$ENV_OUT" | grep -E '^(KAMAILIO_HTTP_HOST|RTPENGINE_HOST|REDIS_URL|VSP_ENV)=' 
echo "$ENV_OUT" | grep '^DATABASE_URL=' | grep -q '@postgres:5432/' || fail "api DATABASE_URL host is not postgres"
echo "$ENV_OUT" | grep '^DATABASE_URL=' | grep -q 'vsp_phone_v4' || fail "api DATABASE_URL db is not vsp_phone_v4"
echo "$ENV_OUT" | grep '^DATABASE_URL=' | grep -Eq '@(localhost|127\.0\.0\.1):' && fail "api DATABASE_URL still uses localhost" || true
echo "$ENV_OUT" | grep -q '^KAMAILIO_HTTP_HOST=kamailio$' || fail "api KAMAILIO_HTTP_HOST != kamailio"
echo "$ENV_OUT" | grep -q '^RTPENGINE_HOST=rtpengine$' || fail "api RTPENGINE_HOST != rtpengine"
echo "$ENV_OUT" | grep -q '^REDIS_URL=redis://redis:6379' || fail "api REDIS_URL incorrect"
pass "injected api env correct"

echo "=== 6) Wait for healthy ==="
for i in $(seq 1 60); do
  if $COMPOSE ps | grep -E 'vsp-api' | grep -qi healthy \
    && $COMPOSE ps | grep -E 'vsp-postgres' | grep -qi healthy \
    && $COMPOSE ps | grep -E 'vsp-redis' | grep -qi healthy; then
    pass "core services healthy after ${i}0s window"
    break
  fi
  if [[ $i -eq 60 ]]; then
    $COMPOSE ps
    fail "services did not become healthy in time"
  fi
  sleep 10
done
$COMPOSE ps

echo "=== 7–8) Probe logs / bootstrap ==="
$COMPOSE logs api --tail=120 | tee /tmp/vsp-api-logs.txt
grep -q 'bootstrap.failed' /tmp/vsp-api-logs.txt && fail "bootstrap.failed still present in api logs" || pass "no bootstrap.failed in recent logs"
grep -q 'production.config.validated\|production.config.validation_failed' /tmp/vsp-api-logs.txt || true

echo "=== 9) API health ==="
CODE="$(curl -sS -o /tmp/vsp-health.json -w '%{http_code}' http://127.0.0.1:3000/api/health || true)"
[[ "$CODE" == "200" ]] || fail "api health returned HTTP $CODE (expected 200)"
pass "api health HTTP 200"
cat /tmp/vsp-health.json; echo

echo "=== 10) Portals (via local nginx/ports if present) ==="
for u in \
  'http://127.0.0.1:3001/login' \
  'http://127.0.0.1/login' \
  'https://127.0.0.1/login'
do
  c="$(curl -skS -o /dev/null -w '%{http_code}' --connect-timeout 5 "$u" || true)"
  echo "$c $u"
done

echo "=== DONE — production validation script finished ==="
