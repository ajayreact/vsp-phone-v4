#!/usr/bin/env bash
# Prove desk Redis vs enroll overlay for extension 100 (RC1).
# Usage on EC2:
#   cd /opt/vsp-phone-v4 && source scripts/platform/ec2-compose-env.sh
#   bash scripts/platform/prove-desk-enroll-ha1-overlay.sh
set -euo pipefail

ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
cd "$ROOT"
# shellcheck disable=SC1091
source scripts/platform/ec2-compose-env.sh

AUTH_USER="${1:-100}"
TENANT_ID="${TENANT_ID:-c8b74757-5846-42f7-ae0f-d61a31d1fd1f}"

echo "=== 1) sipEndpointId for authUsername=${AUTH_USER} ==="
EP_JSON="$($COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -t -A -c \
  "SELECT id, aor, auth_username FROM sip_endpoints WHERE auth_username='${AUTH_USER}' AND deleted_at IS NULL LIMIT 1;")"
echo "$EP_JSON"
SIP_ENDPOINT_ID="$(echo "$EP_JSON" | cut -d'|' -f1 | tr -d '[:space:]')"
if [[ -z "$SIP_ENDPOINT_ID" ]]; then
  echo "FATAL: no sip_endpoints row for ${AUTH_USER}"
  exit 1
fi
echo "sipEndpointId=${SIP_ENDPOINT_ID}"

echo
echo "=== 2) Redis desk credential (version only; password not printed) ==="
DESK_KEY="vsp:prov:desk-sip:$(echo "$SIP_ENDPOINT_ID" | tr '[:upper:]' '[:lower:]')"
DESK_RAW="$($COMPOSE exec -T redis redis-cli GET "$DESK_KEY" || true)"
if [[ -z "$DESK_RAW" || "$DESK_RAW" == "(nil)" ]]; then
  echo "desk Redis: MISSING key=${DESK_KEY}"
else
  echo "desk Redis key=${DESK_KEY}"
  echo "$DESK_RAW" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("version=", d.get("version")); print("authUsername=", d.get("authUsername")); print("realm=", d.get("realm")); print("hasPasswordEnc=", bool(d.get("passwordEnc")))'
fi

echo
echo "=== 3) Active enroll credential (Redis TTL index) ==="
ENROLL_KEY="vsp:${TENANT_ID}:webrtc:enroll:${SIP_ENDPOINT_ID}"
# try common key shapes
for KEY in \
  "$ENROLL_KEY" \
  "vsp:webrtc:enroll:${TENANT_ID}:${SIP_ENDPOINT_ID}" \
  ; do
  RAW="$($COMPOSE exec -T redis redis-cli GET "$KEY" 2>/dev/null || true)"
  TTL="$($COMPOSE exec -T redis redis-cli TTL "$KEY" 2>/dev/null || true)"
  if [[ -n "$RAW" && "$RAW" != "(nil)" ]]; then
    echo "enroll Redis key=${KEY} ttl=${TTL}"
    echo "$RAW" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("version=", d.get("version")); print("deviceId=", d.get("deviceId")); print("expiresAt=", d.get("expiresAt"))'
    break
  else
    echo "enroll Redis miss key=${KEY}"
  fi
done

echo
echo "=== 4) Recent REGISTER HA1 selection (api logs) ==="
$COMPOSE logs api --since 30m 2>/dev/null | grep -E "telecom.auth.ha1_candidates|telecom.auth.ha1_selected|telecom.auth.allow|telecom.auth.deny|telecom.vault.enroll_registered" | tail -n 40 || true

echo
echo "Expected after fix: ha1_selected selectedSource=redis for GRP REGISTER."
echo "Legacy overlay proof: ha1_candidates lists enroll after redis when both active; legacyWouldSelectEnroll=true."
