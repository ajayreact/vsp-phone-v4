#!/usr/bin/env bash
# RC1 final registration stability capture for ext 100 (HA1 overlay proof).
# Deploy 6110431 first, then run:
#   cd /opt/vsp-phone-v4 && source scripts/platform/ec2-compose-env.sh
#   bash scripts/platform/rc1-registration-stability-capture.sh
set -euo pipefail

ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
cd "$ROOT"
# shellcheck disable=SC1091
source scripts/platform/ec2-compose-env.sh

NEED="${NEED_REGISTERS:-5}"
WATCH_MIN="${WATCH_MINUTES:-15}"
AUTH_USER="${AUTH_USER:-100}"

echo "=== deploy check ==="
git rev-parse --short HEAD
git log -1 --oneline
git merge-base --is-ancestor 6110431 HEAD 2>/dev/null && echo "6110431: contained in HEAD" || echo "6110431: NOT in HEAD — pull/rebuild required"

echo
echo "=== sipEndpointId for ${AUTH_USER} ==="
EP="$($COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -t -A -c \
  "SELECT id FROM sip_endpoints WHERE auth_username='${AUTH_USER}' AND deleted_at IS NULL LIMIT 1;" | tr -d '[:space:]')"
echo "sipEndpointId=${EP:-MISSING}"

echo
echo "=== follow api logs until ${NEED} ha1_selected for username=${AUTH_USER} (Ctrl+C to stop early) ==="
echo "Leave phone Registered; do not reprovision."
echo

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Stream logs; collect ha1_selected / allow / deny for username 100
timeout "${WATCH_MIN}m" $COMPOSE logs -f api --since 0s 2>/dev/null | \
  grep --line-buffered -E 'telecom.auth.ha1_candidates|telecom.auth.ha1_selected|telecom.auth.allow|telecom.auth.deny' | \
  tee "$TMP" | \
  python3 - "$NEED" "$AUTH_USER" <<'PY'
import json, re, sys

need = int(sys.argv[1])
user = sys.argv[2]
selected = []
# requestId -> last candidates blob
cands = {}

def parse_msg(line: str):
    # Nest often wraps JSON in message="..."
    m = re.search(r'"message":"(\{.*\})"', line)
    if m:
        raw = m.group(1).encode("utf-8").decode("unicode_escape")
        try:
            return json.loads(raw)
        except Exception:
            return None
    # plain JSON line
    try:
        i = line.index("{")
        return json.loads(line[i:])
    except Exception:
        return None

for line in sys.stdin:
    obj = parse_msg(line)
    if not isinstance(obj, dict):
        continue
    ev = obj.get("event")
    if ev == "telecom.auth.ha1_candidates" and str(obj.get("username")) == user:
        cands[obj.get("requestId")] = obj
        continue
    if ev == "telecom.auth.ha1_selected" and str(obj.get("username")) == user:
        selected.append(obj)
        n = len(selected)
        print(f"REGISTER #{n}", flush=True)
        print(f"sipEndpointId={obj.get('sipEndpointId')}", flush=True)
        print(f"selectedSource={obj.get('selectedSource')}", flush=True)
        print(f"passwordVersion={obj.get('passwordVersion')}", flush=True)
        print(f"allow/deny=pending(allow log)", flush=True)
        print(f"enrollActive={obj.get('enrollActive')}", flush=True)
        print(f"legacyWouldSelectEnroll={obj.get('legacyWouldSelectEnroll')}", flush=True)
        print(f"candidates={(cands.get(obj.get('requestId')) or {}).get('candidates')}", flush=True)
        print("", flush=True)
        if n >= need:
            break
    if ev in ("telecom.auth.allow", "telecom.auth.deny") and (
        str(obj.get("username")) == user or obj.get("sipEndpointId")
    ):
        # annotate last register if same request
        print(f"  -> {ev} reason={obj.get('reason')} selectedSource={obj.get('selectedSource')} passwordVersion={obj.get('passwordVersion')} requestId={obj.get('requestId')}", flush=True)

print("--- summary ---", flush=True)
srcs = [s.get("selectedSource") for s in selected]
vers = [s.get("passwordVersion") for s in selected]
eps = [s.get("sipEndpointId") for s in selected]
print(f"count={len(selected)}", flush=True)
print(f"all_redis={all(s == 'redis' for s in srcs) and len(srcs) >= need}", flush=True)
print(f"same_endpoint={len(set(eps)) == 1 and bool(eps)}", flush=True)
print(f"same_passwordVersion={len(set(vers)) == 1 and bool(vers)}", flush=True)
print(f"sources={srcs}", flush=True)
print(f"versions={vers}", flush=True)
PY

echo
echo "=== bad_digest during window ==="
grep -E 'telecom.auth.deny.*"bad_digest".*"username":"'"$AUTH_USER"'"' "$TMP" || echo "(none in capture buffer)"

echo
echo "=== kamailio location ==="
$COMPOSE exec -T postgres psql -U vsp -d kamailio -c \
  "SELECT username,contact,expires FROM location WHERE username='${AUTH_USER}';"

echo
echo "If all_redis=true, same endpoint/version, zero bad_digest for ${WATCH_MIN}m, and phone UI stays Registered → overlay hypothesis CONFIRMED fixed."
echo "If all redis/stable versions but phone still flaps → overlay hypothesis FALSE; next root cause."
