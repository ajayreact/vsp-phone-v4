#!/usr/bin/env bash
# RC1 Production E2E Audit — 10-phase gated validation (run on EC2).
#
# Usage:
#   bash rc1-evidence/e2e-production-audit.sh              # phases 1–5 automated; 6–10 manual gates
#   bash rc1-evidence/e2e-production-audit.sh --phase 1   # single phase
#   bash rc1-evidence/e2e-production-audit.sh --through 5  # stop after phase 5
#   STOP_ON_FAIL=0 bash rc1-evidence/e2e-production-audit.sh --through 10
#   MANUAL_CALL_TEST=1 SEC=900 bash rc1-evidence/e2e-production-audit.sh --phase 8
#
# Env:
#   REPO_ROOT=/opt/vsp-phone-v4
#   STOP_ON_FAIL=1 (default) — halt on first FAIL
#   MANUAL_CALL_TEST=0 — skip live-call phases (7–9) unless set
#   SEC=900 — outbound hold duration for phase 8
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
cd "$REPO_ROOT"
# shellcheck disable=SC1091
source scripts/platform/ec2-compose-env.sh

STOP_ON_FAIL="${STOP_ON_FAIL:-1}"
MANUAL_CALL_TEST="${MANUAL_CALL_TEST:-0}"
SEC="${SEC:-900}"
PHASE_START=1
PHASE_END=10

while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase) PHASE_START="$2"; PHASE_END="$2"; shift 2 ;;
    --through) PHASE_END="$2"; shift 2 ;;
    --no-stop) STOP_ON_FAIL=0; shift ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 2 ;;
  esac
done

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${OUT:-/tmp/rc1-e2e-audit-${STAMP}}"
mkdir -p "$OUT"
REPORT="$OUT/AUDIT-REPORT.md"
SUMMARY="$OUT/summary.txt"

pass() { echo "PASS: $*" | tee -a "$SUMMARY"; }
fail() { echo "FAIL: $*" | tee -a "$SUMMARY"; }
warn() { echo "WARN: $*" | tee -a "$SUMMARY"; }
skip() { echo "SKIP: $*" | tee -a "$SUMMARY"; }
info() { echo "INFO: $*" | tee -a "$SUMMARY"; }

phase_fail=0
gate() {
  local phase="$1" ok="$2" msg="$3"
  if [[ "$ok" == "1" ]]; then
    pass "Phase $phase — $msg"
    return 0
  fi
  fail "Phase $phase — $msg"
  phase_fail=1
  if [[ "$STOP_ON_FAIL" == "1" ]]; then
    echo "STOP_ON_FAIL=1 — halting after phase $phase" | tee -a "$SUMMARY"
    write_report "$phase"
    exit 1
  fi
  return 1
}

KAM_CTL_SOCK="${KAM_CTL_SOCK:-unix:/tmp/kamailio_ctl}"
KAM_CONTAINER="${KAM_CONTAINER:-vsp-kamailio}"

wait_kamailio_ready() {
  local i
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:8880/health" 2>/dev/null | grep -q '"status":"ok"'; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# kamcmd defaults to /var/run/kamailio/kamailio_ctl; ctl module binds unix:/tmp/kamailio_ctl.
kam_rpc() {
  local cmd="$1" out="$2"
  if docker exec "$KAM_CONTAINER" test -S /tmp/kamailio_ctl 2>/dev/null; then
    if docker exec "$KAM_CONTAINER" sh -c 'command -v kamcmd >/dev/null 2>&1'; then
      docker exec "$KAM_CONTAINER" kamcmd -s "$KAM_CTL_SOCK" "$cmd" > "$out" 2>&1 && return 0
    fi
    if docker exec "$KAM_CONTAINER" sh -c 'command -v kamctl >/dev/null 2>&1'; then
      case "$cmd" in
        dispatcher.list)
          docker exec "$KAM_CONTAINER" kamctl dispatcher dump > "$out" 2>&1 && return 0 ;;
        ul.dump)
          docker exec "$KAM_CONTAINER" kamctl ul show > "$out" 2>&1 && return 0 ;;
        dlg.list|tm.stats|core.version|core.uptime)
          docker exec "$KAM_CONTAINER" kamctl rpc "$cmd" > "$out" 2>&1 && return 0 ;;
      esac
    fi
  fi
  case "$cmd" in
    dispatcher.list)
      docker exec "$KAM_CONTAINER" cat /etc/kamailio/dispatcher.list > "$out" 2>&1 && return 0 ;;
  esac
  return 1
}

write_report() {
  local stopped="${1:-$PHASE_END}"
  {
    echo "# RC1 Production E2E Audit"
    echo
    echo "| Field | Value |"
    echo "|-------|-------|"
    echo "| Timestamp (UTC) | ${STAMP} |"
    echo "| Host | $(hostname -f 2>/dev/null || hostname) |"
    echo "| Git HEAD | $(git rev-parse --short HEAD 2>/dev/null || echo unknown) |"
    echo "| Output dir | ${OUT} |"
    echo "| Phases run | ${PHASE_START}–${stopped} |"
    echo
    echo "## Summary"
    echo '```'
    cat "$SUMMARY" 2>/dev/null || true
    echo '```'
    echo
    echo "Artifacts: \`$OUT/\`"
  } > "$REPORT"
  info "Report written: $REPORT"
}

# ─── Phase 1 — Infrastructure ───────────────────────────────────────────────
run_phase_1() {
  local ok=1
  info "=== Phase 1 — Infrastructure ==="

  docker ps -a > "$OUT/phase1-docker-ps.txt" 2>&1 || { ok=0; warn "docker ps failed"; }
  $COMPOSE ps > "$OUT/phase1-compose-ps.txt" 2>&1 || { ok=0; warn "compose ps failed"; }

  for svc in vsp-api vsp-kamailio vsp-postgres vsp-redis vsp-rtpengine; do
    if ! grep -q "$svc" "$OUT/phase1-docker-ps.txt" 2>/dev/null; then
      ok=0; fail "container missing: $svc"
    elif ! grep "$svc" "$OUT/phase1-docker-ps.txt" | grep -qiE 'Up|healthy'; then
      ok=0; fail "container not healthy: $svc"
    else
      pass "container up: $svc"
    fi
  done

  docker network ls > "$OUT/phase1-network-ls.txt" 2>&1 || true
  NET="$(docker inspect vsp-kamailio --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || true)"
  if [[ -n "$NET" ]]; then
    docker network inspect "$NET" > "$OUT/phase1-network-inspect.json" 2>&1 || true
    pass "docker network: $NET"
  else
    ok=0; fail "could not resolve kamailio docker network"
  fi

  free -h > "$OUT/phase1-free.txt" 2>&1 || true
  df -h > "$OUT/phase1-df.txt" 2>&1 || true
  AVAIL="$(df -h / | awk 'NR==2 {print $4}')"
  info "disk avail on /: $AVAIL"

  ss -lunp > "$OUT/phase1-ss-udp.txt" 2>&1 || true
  for port in 5060 5061 2223; do
    if grep -q ":${port} " "$OUT/phase1-ss-udp.txt" 2>/dev/null || grep -q ":${port}\b" "$OUT/phase1-ss-udp.txt" 2>/dev/null; then
      pass "UDP/TCP port listening: $port"
    else
      warn "port $port not seen in ss -lunp (may be bound in container namespace)"
    fi
  done
  ss -lunp | grep -E '10000|10099' > "$OUT/phase1-rtp-range.txt" 2>&1 || warn "RTP range 10000–10099 not on host ss (container-only OK)"

  (sudo iptables -L -n 2>/dev/null || iptables -L -n 2>/dev/null || true) > "$OUT/phase1-iptables.txt"
  (sudo ufw status 2>/dev/null || ufw status 2>/dev/null || true) > "$OUT/phase1-ufw.txt"
  curl -sS -4 --max-time 5 ifconfig.me > "$OUT/phase1-public-ip.txt" 2>&1 || true
  pass "public IP: $(cat "$OUT/phase1-public-ip.txt" 2>/dev/null || echo unknown)"

  getent hosts "$(grep -m1 '^SIP_PLATFORM_DOMAIN=' .env 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'"' || true)" \
    > "$OUT/phase1-dns.txt" 2>&1 || true

  gate 1 "$ok" "Infrastructure (containers, network, host resources)"
}

# ─── Phase 2 — Kamailio ─────────────────────────────────────────────────────
run_phase_2() {
  local ok=1
  info "=== Phase 2 — Kamailio ==="

  if ! wait_kamailio_ready; then
    ok=0; fail "kamailio HTTP health not ready within 60s"
  else
    curl -sf "http://127.0.0.1:8880/health" > "$OUT/phase2-kam-http.json" 2>&1 || { ok=0; fail "kamailio HTTP health"; }
  fi
  docker exec "$KAM_CONTAINER" kamailio -c -f /tmp/kamailio.runtime.cfg > "$OUT/phase2-kam-lint.txt" 2>&1 \
    || { ok=0; fail "kamailio config lint"; }

  docker exec "$KAM_CONTAINER" sh -c 'command -v kamcmd; command -v kamctl; ls -la /tmp/kamailio_ctl 2>/dev/null || true' \
    > "$OUT/phase2-kam-tools.txt" 2>&1 || true

  for cmd in "core.version" "core.uptime" "dispatcher.list" "ul.dump" "dlg.list" "tm.stats"; do
    if kam_rpc "$cmd" "$OUT/phase2-kamcmd-${cmd//./-}.txt"; then
      pass "kam RPC $cmd"
    else
      ok=0; fail "kam RPC $cmd (see phase2-kam-tools.txt)"
    fi
  done

  grep -qi telnyx "$OUT/phase2-kamcmd-dispatcher-list.txt" 2>/dev/null \
    && pass "dispatcher includes telnyx" || { ok=0; fail "dispatcher missing telnyx"; }
  grep -qi rtpengine "$OUT/phase2-kamcmd-dispatcher-list.txt" 2>/dev/null \
    && pass "dispatcher includes rtpengine" || { ok=0; fail "dispatcher missing rtpengine"; }

  CFG="$OUT/phase2-runtime-routes.txt"
  docker exec vsp-kamailio grep -E 'route\[|DESK_NORMALIZE|CARRIER_RELAY_ACK|CARRIER_APPLY_ACK|BRIDGE_CARRIER|REGISTER|record_route|loose_route|nathelper|rtpengine' \
    /tmp/kamailio.runtime.cfg > "$CFG" 2>&1 || true
  for token in DESK_NORMALIZE_CARRIER_REPLY CARRIER_RELAY_ACK CARRIER_APPLY_ACK_ROUTE BRIDGE_CARRIER; do
    grep -q "$token" "$CFG" && pass "route present: $token" || { ok=0; fail "route missing: $token"; }
  done

  git rev-parse --short HEAD > "$OUT/phase2-git-head.txt" 2>&1 || true
  docker exec vsp-kamailio grep -c 'carrier ACK route applied' /tmp/kamailio.runtime.cfg \
    > "$OUT/phase2-route-log-marker.txt" 2>&1 || true

  gate 2 "$ok" "Kamailio (health, kamcmd, routing blocks)"
}

# ─── Phase 3 — RTPengine ─────────────────────────────────────────────────────
run_phase_3() {
  local ok=1
  info "=== Phase 3 — RTPengine ==="

  curl -sf "http://127.0.0.1:3000/api/health/rtpengine" > "$OUT/phase3-rtp-api.json" 2>&1 \
    || warn "API rtpengine health probe failed (non-fatal if daemon up)"

  if $COMPOSE exec -T rtpengine rtpengine-ctl list > "$OUT/phase3-rtpengine-list.txt" 2>&1; then
    pass "rtpengine-ctl list"
  elif $COMPOSE exec -T rtpengine pgrep -a rtpengine > "$OUT/phase3-rtpengine-pgrep.txt" 2>&1; then
    warn "rtpengine-ctl unavailable; process running"
  else
    ok=0; fail "rtpengine not running"
  fi

  $COMPOSE logs rtpengine --tail 200 > "$OUT/phase3-rtpengine-logs.txt" 2>&1 || true
  if grep -qi 'crash\|fatal\|segfault' "$OUT/phase3-rtpengine-logs.txt" 2>/dev/null; then
    ok=0; fail "rtpengine crash indicators in logs"
  fi

  gate 3 "$ok" "RTPengine (process, control plane)"
}

# ─── Phase 4 — Telnyx ───────────────────────────────────────────────────────
run_phase_4() {
  local ok=1
  info "=== Phase 4 — Telnyx ==="

  grep -E '^TELNYX_' .env | sed -E 's/(KEY|SECRET|PASSWORD)=.+/\\1=***/' > "$OUT/phase4-telnyx-env.txt" 2>&1 || true
  grep -q '^TELNYX_SIP_HOST=' .env && pass "TELNYX_SIP_HOST set" || { ok=0; fail "TELNYX_SIP_HOST missing"; }
  grep -q '^TELNYX_API_KEY=' .env && pass "TELNYX_API_KEY set" || { ok=0; fail "TELNYX_API_KEY missing"; }

  curl -sf "http://127.0.0.1:3000/api/health/telnyx" > "$OUT/phase4-telnyx-health.json" 2>&1 \
    || { ok=0; fail "API /health/telnyx"; }

  if [[ -f rc1-evidence/telnyx-config-audit.sh ]]; then
    bash rc1-evidence/telnyx-config-audit.sh > "$OUT/phase4-telnyx-config-audit.txt" 2>&1 \
      || { ok=0; fail "telnyx-config-audit.sh"; }
  else
    warn "telnyx-config-audit.sh not found"
  fi

  grep telnyx infrastructure/kamailio/dispatcher.list > "$OUT/phase4-dispatcher-telnyx.txt" 2>&1 \
    && pass "dispatcher.list telnyx entries" || { ok=0; fail "dispatcher.list telnyx"; }

  gate 4 "$ok" "Telnyx (env, API health, connection audit)"
}

# ─── Phase 5 — Database ─────────────────────────────────────────────────────
run_phase_5() {
  local ok=1
  info "=== Phase 5 — Database ==="

  if [[ -f scripts/platform/rc1-infrastructure-validate.cjs ]]; then
    if $COMPOSE exec -T api node scripts/platform/rc1-infrastructure-validate.cjs > "$OUT/phase5-rc1-infra-validate.txt" 2>&1; then
      pass "rc1-infrastructure-validate.cjs (via api container)"
    else
      ok=0; fail "rc1-infrastructure-validate.cjs — see phase5-rc1-infra-validate.txt"
    fi
  fi

  PSQL="$COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -t -A"
  $PSQL -c "SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL;" > "$OUT/phase5-tenants.txt" 2>&1 \
    && pass "tenants query" || { ok=0; fail "tenants query"; }
  $PSQL -c "SELECT number, tenant_id, line_id, status FROM phone_numbers WHERE deleted_at IS NULL LIMIT 20;" \
    > "$OUT/phase5-dids.txt" 2>&1 || { ok=0; fail "phone_numbers query"; }
  $PSQL -c "SELECT tenant_id, extension, line_id FROM extensions WHERE deleted_at IS NULL ORDER BY tenant_id, extension LIMIT 30;" \
    > "$OUT/phase5-extensions.txt" 2>&1 || { ok=0; fail "extensions query"; }
  $PSQL -c "SELECT auth_username, aor, tenant_id, registration_status FROM sip_endpoints WHERE deleted_at IS NULL LIMIT 20;" \
    > "$OUT/phase5-sip-endpoints.txt" 2>&1 || warn "sip_endpoints query failed"
  $PSQL -c "
    SELECT pn.number, pn.line_id, e.extension
    FROM phone_numbers pn
    LEFT JOIN extensions e ON e.line_id = pn.line_id AND e.deleted_at IS NULL
    WHERE pn.deleted_at IS NULL AND pn.tenant_id IS NOT NULL
      AND (pn.line_id IS NULL OR e.id IS NULL)
    LIMIT 10;" > "$OUT/phase5-unmapped-dids.txt" 2>&1 || true
  if [[ -s "$OUT/phase5-unmapped-dids.txt" ]] && grep -qv '^$' "$OUT/phase5-unmapped-dids.txt"; then
    warn "DIDs without extension mapping (inbound 404 risk) — see phase5-unmapped-dids.txt"
  else
    pass "no unmapped DIDs in sample"
  fi

  gate 5 "$ok" "Database (integrity, DID/extension mapping)"
}

# ─── Phase 6 — Registration ─────────────────────────────────────────────────
run_phase_6() {
  local ok=1
  info "=== Phase 6 — Registration ==="

  kam_rpc ul.dump "$OUT/phase6-ul-dump.txt" \
    || { ok=0; fail "kam RPC ul.dump"; }

  if command -v node >/dev/null 2>&1 && [[ -f scripts/platform/parse-usrloc-dump.cjs ]]; then
    node scripts/platform/parse-usrloc-dump.cjs "$OUT/phase6-ul-dump.txt" > "$OUT/phase6-contacts.json" 2>&1 \
      && pass "parsed usrloc contacts" || warn "parse-usrloc-dump failed"
  fi

  $COMPOSE logs kamailio --since 30m 2>&1 | grep -E 'REGISTER|401|403|200 OK' > "$OUT/phase6-register-logs.txt" || true
  if grep -c '401 Unauthorized' "$OUT/phase6-register-logs.txt" 2>/dev/null | grep -qv '^0$'; then
    LOOPS="$(grep -c '401 Unauthorized' "$OUT/phase6-register-logs.txt" || echo 0)"
    if [[ "$LOOPS" -gt 20 ]]; then
      ok=0; fail "possible 401 REGISTER loops ($LOOPS in 30m)"
    else
      warn "401 REGISTER responses in last 30m: $LOOPS (digest challenge expected)"
    fi
  fi

  if ! grep -qi '100\|extension' "$OUT/phase6-ul-dump.txt" 2>/dev/null; then
    warn "extension 100 not found in ul.dump — phone may be unregistered"
  else
    pass "registered contacts present in usrloc"
  fi

  gate 6 "$ok" "Registration (usrloc, no auth loops)"
}

# ─── Phase 7 — Inbound calls ────────────────────────────────────────────────
run_phase_7() {
  info "=== Phase 7 — Inbound calls (manual gate) ==="
  if [[ "$MANUAL_CALL_TEST" != "1" ]]; then
    skip "Phase 7 — set MANUAL_CALL_TEST=1 and place inbound PSTN→DID call"
    cat >> "$OUT/phase7-inbound-checklist.txt" <<'EOF'
Manual inbound test:
1. Call assigned DID from external PSTN/mobile
2. Expect: INVITE → Kamailio → tenant route → extension → phone rings
3. Answer → 200 OK → ACK → RTP both ways → BYE
4. Capture: SEC=120 bash rc1-evidence/capture-teardown.sh
5. Fail indicators: 404 Not Found, 486, no ring, one-way audio
EOF
    return 0
  fi
  warn "Phase 7 requires live inbound call — verify logs after test"
  $COMPOSE logs kamailio --since 10m 2>&1 | grep -E 'INBOUND|DID|404|INVITE.*telnyx' > "$OUT/phase7-inbound-logs.txt" || true
  if grep -q '404' "$OUT/phase7-inbound-logs.txt" 2>/dev/null; then
    gate 7 0 "Inbound routing returned 404 — check DID→extension mapping"
  else
    gate 7 1 "Inbound (manual) — no 404 in recent logs; confirm call completed manually"
  fi
}

# ─── Phase 8 — Outbound calls ───────────────────────────────────────────────
run_phase_8() {
  info "=== Phase 8 — Outbound calls ==="
  if [[ "$MANUAL_CALL_TEST" != "1" ]]; then
    skip "Phase 8 — set MANUAL_CALL_TEST=1 SEC=900 and run validate-32s-fix.sh"
    return 0
  fi

  git log --oneline -1 > "$OUT/phase8-git-head.txt"
  if [[ -x rc1-evidence/validate-32s-fix.sh ]]; then
    SEC="$SEC" bash rc1-evidence/validate-32s-fix.sh 2>&1 | tee "$OUT/phase8-validate-32s.log" || true
  else
    fail "validate-32s-fix.sh missing"; gate 8 0 "Outbound validation script missing"; return
  fi

  local ok=1
  if grep -qi 'FAIL.*32\|result=PENDING_OR_FAIL' "$OUT/phase8-validate-32s.log" 2>/dev/null; then
    ok=0
  fi
  if grep -q 'carrier phone ACK relay' "$OUT/phase8-validate-32s.log" 2>/dev/null \
     && grep -qE 'carrier ACK route applied count=[2-9]' "$OUT/phase8-validate-32s.log" 2>/dev/null; then
    pass "Phase 8 ACK relay logs (route count ≥2)"
  else
    warn "Phase 8 — missing carrier ACK route applied count=2 in logs"
  fi
  if grep -qi 'result=PASS' "$OUT/phase8-validate-32s.log" 2>/dev/null; then
    ok=1
  fi
  gate 8 "$ok" "Outbound PSTN call (≥10 min hold, no T+32s BYE)"
}

# ─── Phase 9 — Media ─────────────────────────────────────────────────────────
run_phase_9() {
  info "=== Phase 9 — Media ==="
  if [[ "$MANUAL_CALL_TEST" != "1" ]]; then
    skip "Phase 9 — requires completed call; run after phase 8"
    return 0
  fi

  CALLID="$(grep -oE '[0-9]+-[0-9]+-[0-9]+@BCC\.BHH\.CE[GHL]\.[A-Z]{3,4}' "$OUT/phase8-validate-32s.log" 2>/dev/null | tail -1 || true)"
  if [[ -z "$CALLID" ]]; then
    warn "no Call-ID from phase 8 — skipping RTP deep dive"
    gate 9 0 "Media — no call to analyze"
    return
  fi

  bash rc1-evidence/investigate-32s-call.sh "$CALLID" 2>&1 | tee "$OUT/phase9-investigate.log" || true
  local ok=1
  if grep -q '0 RTP packets' "$OUT/phase9-investigate.log" 2>/dev/null; then
    ok=0; fail "desk leg 0 RTP packets (one-way / no uplink)"
  fi
  gate 9 "$ok" "Media (bidirectional RTP on desk + carrier legs)"
}

# ─── Phase 10 — Failure scenarios ───────────────────────────────────────────
run_phase_10() {
  info "=== Phase 10 — Failure scenarios (checklist) ==="
  cat > "$OUT/phase10-failure-checklist.md" <<'EOF'
# Phase 10 — Failure scenario checklist (manual)

| Scenario | Test | Expected | Status |
|----------|------|----------|--------|
| Busy | B on call, A calls B | 486 Busy Here | ☐ |
| Decline | B rejects | 603/486 | ☐ |
| Timeout | No answer | 408/480 | ☐ |
| Unregistered | Call offline ext | 404/480 | ☐ |
| Invalid DID | Call unassigned DID | 404 | ☐ |
| Invalid extension | Dial bad ext | 404 | ☐ |
| Carrier failure | Block Telnyx IP (lab) | Failover/retry | ☐ |
| Container restart | `docker restart vsp-kamailio` mid-call | Recovery / re-REGISTER | ☐ |

Priority historical failures (RC1):
- Inbound 404 (DID not mapped) — Phase 5 unmapped-dids.txt
- Dispatcher/routing — Phase 2 kamcmd dispatcher.list
- ACK after 200 / T+32s BYE — Phase 8 validate-32s-fix
- Zero desk RTP — Phase 9 investigate
EOF
  skip "Phase 10 — manual checklist written to phase10-failure-checklist.md"
}

# ─── Main ───────────────────────────────────────────────────────────────────
info "RC1 E2E audit starting — OUT=$OUT phases=$PHASE_START..$PHASE_END"
for p in $(seq "$PHASE_START" "$PHASE_END"); do
  phase_fail=0
  case "$p" in
    1) run_phase_1 ;;
    2) run_phase_2 ;;
    3) run_phase_3 ;;
    4) run_phase_4 ;;
    5) run_phase_5 ;;
    6) run_phase_6 ;;
    7) run_phase_7 ;;
    8) run_phase_8 ;;
    9) run_phase_9 ;;
    10) run_phase_10 ;;
  esac
done

write_report "$PHASE_END"
echo
echo "=== Audit complete — $REPORT ==="
grep -E '^(PASS|FAIL|SKIP|WARN):' "$SUMMARY" 2>/dev/null | sort | uniq -c || true
