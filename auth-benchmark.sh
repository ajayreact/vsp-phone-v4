#!/usr/bin/env bash
# RC1 Authentication Performance Benchmark
# Run on EC2:  bash auth-benchmark.sh
# Requires: EMAIL + PASS (or TENANT_EMAIL/TENANT_PASSWORD / PLATFORM_*)
# Optional: PORTAL (default tenant), N (default 20), API (default http://127.0.0.1:3000/api)
set -u

REPO_ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
cd "$REPO_ROOT" || { echo "ERROR: cannot cd to $REPO_ROOT"; exit 1; }

if [[ -f scripts/platform/ec2-compose-env.sh ]]; then
  # shellcheck disable=SC1091
  source scripts/platform/ec2-compose-env.sh
else
  export COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env}"
fi

EMAIL="${EMAIL:-${TENANT_EMAIL:-${PLATFORM_EMAIL:-${E2E_TENANT_EMAIL:-}}}}"
PASS="${PASS:-${TENANT_PASSWORD:-${PLATFORM_PASSWORD:-${E2E_TENANT_PASSWORD:-}}}}"
PORTAL="${PORTAL:-tenant}"
N="${N:-20}"
API="${API:-http://127.0.0.1:3000/api}"
DB_USER="${DB_USER:-vsp}"
DB_NAME="${DB_NAME:-vsp_phone_v4}"

OUT_DIR="${OUT_DIR:-/tmp/vsp-auth-benchmark-$$}"
mkdir -p "$OUT_DIR"

if [[ -z "$EMAIL" || -z "$PASS" ]]; then
  echo "ERROR: set EMAIL and PASS (or TENANT_EMAIL/TENANT_PASSWORD)."
  echo "Example: EMAIL=user@example.com PASS='secret' PORTAL=tenant bash auth-benchmark.sh"
  exit 1
fi

echo "========================================="
echo "1. Runtime verification"
echo "========================================="
echo "HEAD=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "PWD=$(pwd)"
echo "API=$API PORTAL=$PORTAL N=$N"
echo
echo "--- docker ps ---"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
echo
echo "--- compose ps api ---"
$COMPOSE ps api 2>/dev/null || docker ps --filter name=vsp-api --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
echo

echo "========================================="
echo "2. API timings ($N iterations)"
echo "========================================="

# Start capturing pipeline logs for the duration of the run
: > "$OUT_DIR/pipeline-raw.log"
docker logs vsp-api --tail=0 -f 2>&1 | tee -a "$OUT_DIR/pipeline-raw.log" >/dev/null &
LOG_PID=$!
sleep 1

CSV="$OUT_DIR/curl-timings.csv"
echo 'iter,login_s,me_s,logout_s,login_code,me_code,logout_code' > "$CSV"

for i in $(seq 1 "$N"); do
  LOGIN_BODY="$OUT_DIR/login-$i.json"
  LOGIN_META=$(curl -sS -m 45 -X POST "$API/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\",\"portal\":\"${PORTAL}\"}" \
    -o "$LOGIN_BODY" -w '%{http_code} %{time_total}' || echo "000 0")
  LOGIN_CODE=$(echo "$LOGIN_META" | awk '{print $1}')
  LOGIN_T=$(echo "$LOGIN_META" | awk '{print $2}')

  TOKEN=""
  if command -v python3 >/dev/null 2>&1; then
    TOKEN=$(python3 - "$LOGIN_BODY" <<'PY' 2>/dev/null || true
import json,sys
try:
  print(json.load(open(sys.argv[1])).get("accessToken") or "")
except Exception:
  print("")
PY
)
  else
    TOKEN=$(sed -n 's/.*"accessToken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$LOGIN_BODY" | head -1)
  fi

  if [[ -n "$TOKEN" ]]; then
    ME_META=$(curl -sS -m 45 "$API/v1/auth/me" \
      -H "Authorization: Bearer ${TOKEN}" \
      -o /dev/null -w '%{http_code} %{time_total}' || echo "000 0")
    ME_CODE=$(echo "$ME_META" | awk '{print $1}')
    ME_T=$(echo "$ME_META" | awk '{print $2}')

    LOGOUT_META=$(curl -sS -m 45 -X POST "$API/v1/auth/logout" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H 'Content-Type: application/json' \
      -d '{}' \
      -o /dev/null -w '%{http_code} %{time_total}' || echo "000 0")
    LOGOUT_CODE=$(echo "$LOGOUT_META" | awk '{print $1}')
    LOGOUT_T=$(echo "$LOGOUT_META" | awk '{print $2}')
  else
    ME_CODE=0; ME_T=0
    LOGOUT_CODE=0; LOGOUT_T=0
  fi

  echo "${i},${LOGIN_T},${ME_T},${LOGOUT_T},${LOGIN_CODE},${ME_CODE},${LOGOUT_CODE}" >> "$CSV"
  printf 'iter=%s login=%ss(%s) me=%ss(%s) logout=%ss(%s)\n' \
    "$i" "$LOGIN_T" "$LOGIN_CODE" "$ME_T" "$ME_CODE" "$LOGOUT_T" "$LOGOUT_CODE"
  sleep 0.2
done

# Also pull recent pipeline lines from docker history (in case follow missed some)
docker logs vsp-api --since 15m 2>&1 | grep '\[vsp-pipeline\]' >> "$OUT_DIR/pipeline-raw.log" || true

sleep 2
kill "$LOG_PID" 2>/dev/null || true
wait "$LOG_PID" 2>/dev/null || true

grep '\[vsp-pipeline\]' "$OUT_DIR/pipeline-raw.log" > "$OUT_DIR/pipeline-lines.log" || true

echo
echo "========================================="
echo "4. Redis"
echo "========================================="
{
  echo "=== INFO stats ==="
  $COMPOSE exec -T redis redis-cli INFO stats 2>/dev/null || docker exec vsp-redis redis-cli INFO stats 2>/dev/null || echo "(redis unavailable)"
  echo
  echo "=== INFO clients ==="
  $COMPOSE exec -T redis redis-cli INFO clients 2>/dev/null || docker exec vsp-redis redis-cli INFO clients 2>/dev/null || true
  echo
  echo "=== LATENCY LATEST ==="
  $COMPOSE exec -T redis redis-cli LATENCY LATEST 2>/dev/null || docker exec vsp-redis redis-cli LATENCY LATEST 2>/dev/null || true
  echo
  echo "=== SLOWLOG GET 20 ==="
  $COMPOSE exec -T redis redis-cli SLOWLOG GET 20 2>/dev/null || docker exec vsp-redis redis-cli SLOWLOG GET 20 2>/dev/null || true
} | tee "$OUT_DIR/redis.txt"

echo
echo "========================================="
echo "5. PostgreSQL"
echo "========================================="
{
  $COMPOSE exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -c \
"SELECT pid, state, wait_event_type, wait_event, left(query, 160) AS query
 FROM pg_stat_activity
 WHERE datname = current_database()
 ORDER BY state NULLS LAST, query_start NULLS LAST;" 2>/dev/null \
  || docker exec vsp-postgres psql -U "$DB_USER" -d "$DB_NAME" -c \
"SELECT pid, state, wait_event_type, wait_event, left(query, 160) AS query
 FROM pg_stat_activity
 WHERE datname = current_database()
 ORDER BY state NULLS LAST, query_start NULLS LAST;" 2>/dev/null \
  || echo "(postgres query unavailable)"
} | tee "$OUT_DIR/postgres.txt"

echo
echo "========================================="
echo "API timings"
echo "========================================="

python3 - "$CSV" <<'PY'
import csv, sys

def summarize(xs):
    xs = sorted(float(x) for x in xs if x is not None)
    if not xs:
        return None
    p95 = xs[max(0, int(0.95 * (len(xs) - 1)))]
    return len(xs), sum(xs) / len(xs), p95, max(xs)

rows = list(csv.DictReader(open(sys.argv[1])))
for label, key in (("login", "login_s"), ("me", "me_s"), ("logout", "logout_s")):
    # only count rows where HTTP code looks successful-ish (>0 and not 000)
    code_key = key.replace("_s", "_code")
    vals = []
    for r in rows:
        try:
            code = int(float(r[code_key]))
            t = float(r[key])
        except Exception:
            continue
        if code >= 200 and code < 500 and t > 0:
            vals.append(t)
    s = summarize(vals)
    print(label)
    if not s:
        print("  avg=N/A")
        print("  p95=N/A")
        print("  max=N/A")
        print("  (no successful samples)")
    else:
        n, avg, p95, mx = s
        print(f"  avg={avg:.6f}s  (n={n})")
        print(f"  p95={p95:.6f}s")
        print(f"  max={mx:.6f}s")
    print()
PY

echo "========================================="
echo "Pipeline timings"
echo "========================================="
echo "(from existing [vsp-pipeline] EXIT logs only; sorted by max elapsedMs)"
echo

python3 - "$OUT_DIR/pipeline-lines.log" <<'PY'
import json, re, sys
from collections import defaultdict

wanted = {
    "guard.AuthRateLimitGuard",
    "guard.AuthRateLimitGuard.redis.incr",
    "service.AuthHardening.assertNotLocked",
    "service.AuthHardening.assertNotLocked.redis.get",
    "service.Prisma.user.findFirst",
    "service.verifyPassword",
    "service.jwt.signJwt",
    "controller.AuthController.login",
    "service.AuthService.login",
    "pipe.ValidationPipe",
    "interceptor.InFlight",
    "middleware.security_headers",
    "middleware.load_balancer",
}

vals = defaultdict(list)
path = sys.argv[1]
try:
    lines = open(path, errors="ignore")
except FileNotFoundError:
    lines = []

for line in lines:
    if "[vsp-pipeline]" not in line:
        continue
    m = re.search(r"\{.*\}", line)
    if not m:
        continue
    try:
        o = json.loads(m.group(0))
    except Exception:
        continue
    if o.get("stage") != "EXIT":
        continue
    phase = o.get("phase")
    if phase not in wanted:
        continue
    try:
        vals[phase].append(float(o["elapsedMs"]))
    except Exception:
        pass

ranked = []
for phase, xs in vals.items():
    xs = sorted(xs)
    n = len(xs)
    avg = sum(xs) / n
    p95 = xs[max(0, int(0.95 * (n - 1)))]
    mx = xs[-1]
    ranked.append((mx, avg, p95, n, phase))

if not ranked:
    print("NO_PIPELINE_EXIT_DATA")
    print("Confirm API image includes [vsp-pipeline] (commit with login-pipeline-trace).")
else:
    for mx, avg, p95, n, phase in sorted(ranked, key=lambda t: (-t[0], -t[1])):
        print(phase)
        print(f"  avg={avg:.3f}ms  (n={n})")
        print(f"  p95={p95:.3f}ms")
        print(f"  max={mx:.3f}ms")
        print()
PY

echo "========================================="
echo "Redis"
echo "========================================="
python3 - "$OUT_DIR/redis.txt" <<'PY'
import sys,re
text=open(sys.argv[1], errors="ignore").read()
def grab(key):
    m=re.search(rf"^{re.escape(key)}:(.*)$", text, re.M)
    return m.group(1).strip() if m else "N/A"
print(f"blocked_clients={grab('blocked_clients')}")
print(f"connected_clients={grab('connected_clients')}")
print(f"rejected_connections={grab('rejected_connections')}")
print(f"total_connections_received={grab('total_connections_received')}")
print(f"instantaneous_ops_per_sec={grab('instantaneous_ops_per_sec')}")
print()
print("Latency (LATENCY LATEST):")
lat=False
for line in text.splitlines():
    if "LATENCY LATEST" in line:
        lat=True
        continue
    if lat:
        if line.startswith("==="):
            break
        if line.strip():
            print(" ", line)
if not lat:
    print("  (section missing)")
print()
print("Slowlog (SLOWLOG GET 20):")
slow=False
count=0
for line in text.splitlines():
    if "SLOWLOG GET" in line:
        slow=True
        continue
    if slow:
        if line.startswith("==="):
            break
        print(" ", line)
        count += 1
if not slow or count==0:
    print("  (empty or unavailable)")
PY

echo
echo "========================================="
echo "PostgreSQL"
echo "========================================="
python3 - "$OUT_DIR/postgres.txt" <<'PY'
import sys
text=open(sys.argv[1], errors="ignore").read()
print(text if text.strip() else "(no rows)")
print()
waiting=0
locks=0
for line in text.splitlines():
    low=line.lower()
    if "wait_event" in low and "pid" in low:
        continue
    parts=[p.strip() for p in line.split("|")]
    if len(parts) < 4:
        continue
    state=(parts[1] if len(parts)>1 else "").lower()
    wet=(parts[2] if len(parts)>2 else "").strip()
    we=(parts[3] if len(parts)>3 else "").strip()
    if wet and wet not in ("", "wait_event_type") and wet.lower() != "null":
        waiting += 1
    if "lock" in (wet+we+state).lower():
        locks += 1
print(f"waiting_or_wait_event_rows≈{waiting}")
print(f"lock_related_rows≈{locks}")
PY

echo
echo "========================================="
echo "Conclusion"
echo "========================================="
python3 - "$OUT_DIR/pipeline-lines.log" "$CSV" <<'PY'
import json, re, csv, sys
from collections import defaultdict

vals = defaultdict(list)
path = sys.argv[1]
try:
    f = open(path, errors="ignore")
except FileNotFoundError:
    f = []
for line in f:
    if "[vsp-pipeline]" not in line:
        continue
    m = re.search(r"\{.*\}", line)
    if not m:
        continue
    try:
        o = json.loads(m.group(0))
    except Exception:
        continue
    if o.get("stage") != "EXIT" or "elapsedMs" not in o:
        continue
    vals[o["phase"]].append(float(o["elapsedMs"]))

if not vals:
    print("slowest_phase=UNKNOWN")
    print("reason=no [vsp-pipeline] EXIT samples collected during this run")
else:
    ranked = []
    for phase, xs in vals.items():
        ranked.append((max(xs), sum(xs)/len(xs), phase, len(xs)))
    ranked.sort(reverse=True)
    mx, avg, phase, n = ranked[0]
    print(f"slowest_phase={phase}")
    print(f"slowest_max_ms={mx:.3f}")
    print(f"slowest_avg_ms={avg:.3f}")
    print(f"slowest_n={n}")

# curl endpoint with highest max
rows=list(csv.DictReader(open(sys.argv[2])))
best=("none", -1.0)
for label,key in (("login","login_s"),("me","me_s"),("logout","logout_s")):
    xs=[float(r[key]) for r in rows if float(r.get(key) or 0) > 0]
    if xs and max(xs) > best[1]:
        best=(label, max(xs))
print(f"slowest_http_endpoint={best[0]}")
print(f"slowest_http_max_s={best[1]:.6f}")
PY

echo
echo "Artifacts: $OUT_DIR"
echo "  curl-timings.csv"
echo "  pipeline-lines.log"
echo "  redis.txt"
echo "  postgres.txt"
