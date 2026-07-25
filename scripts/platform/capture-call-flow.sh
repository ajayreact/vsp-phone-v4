#!/usr/bin/env bash
# Capture Kamailio + API + RTPengine logs simultaneously during a live test
# call, timestamp-merged into one file for SIP-ladder reconstruction.
#
# Telnyx Call Control logs are NOT captured here (they're external/HTTP) —
# see the printed instructions at the end for pulling those from the Telnyx
# Mission Control Portal / Call Control API for the same time window.
#
# Usage (on EC2):
#   bash scripts/platform/capture-call-flow.sh [duration_seconds] [out_dir]
#
#   Default duration: 180s. Default out_dir: /tmp/vsp-call-capture-<ts>.
#   The script prints a countdown; place your REGISTER + test call(s) while
#   it's running, then let it finish (or Ctrl+C early — it cleans up either way).

set -uo pipefail

DURATION="${1:-180}"
OUT_DIR="${2:-/tmp/vsp-call-capture-$(date +%Y%m%dT%H%M%S)}"
mkdir -p "$OUT_DIR"

echo "Output dir: $OUT_DIR"
echo "Capturing for ${DURATION}s from vsp-kamailio, vsp-api, vsp-rtpengine ..."

PIDS=()

start_capture() {
  local container="$1"
  local outfile="$2"
  if docker inspect "$container" >/dev/null 2>&1; then
    docker logs -f -t --since 0s "$container" > "$outfile" 2>&1 &
    PIDS+=("$!")
    echo "  capturing $container -> $outfile (pid $!)"
  else
    echo "  SKIP $container — container not found"
    : > "$outfile"
  fi
}

start_capture vsp-kamailio "$OUT_DIR/kamailio.raw.log"
start_capture vsp-api "$OUT_DIR/api.raw.log"
start_capture vsp-rtpengine "$OUT_DIR/rtpengine.raw.log"

cleanup() {
  echo
  echo "Stopping capture..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
  wait >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo
echo ">>> PLACE YOUR TEST CALL(S) NOW <<<"
for ((i = DURATION; i > 0; i -= 10)); do
  echo "  ${i}s remaining..."
  sleep 10
done

cleanup
trap - EXIT INT TERM

echo
echo "Merging into $OUT_DIR/merged.log (timestamp-sorted) ..."

# Every line here starts with an RFC3339 docker timestamp (docker logs -t).
# Tag each line with its source so the merged view is unambiguous, then
# sort all three streams together by that leading timestamp.
{
  awk '{print "[KAM] " $0}' "$OUT_DIR/kamailio.raw.log" 2>/dev/null
  awk '{print "[API] " $0}' "$OUT_DIR/api.raw.log" 2>/dev/null
  awk '{print "[RTP] " $0}' "$OUT_DIR/rtpengine.raw.log" 2>/dev/null
} | sort -k2 > "$OUT_DIR/merged.log"

LINES=$(wc -l < "$OUT_DIR/merged.log" | tr -d ' ')
echo "Merged $LINES lines."
echo
echo "=== Quick milestone grep (sanity check) ==="
for pat in "INVITE r-uri" "REGISTER aor" "100 Trying" "180" "200 OK" "\bACK\b" "\bBYE\b" "telecom.route.resolve" "telecom.route.caller_lookup" "REJECT" "rtpengine"; do
  n=$(grep -Ec -- "$pat" "$OUT_DIR/merged.log" 2>/dev/null)
  [[ -z "$n" ]] && n=0
  printf "  %-28s %s\n" "$pat" "$n"
done

echo
echo "Next steps:"
echo "  1) Copy $OUT_DIR/merged.log locally (or paste relevant excerpts back)."
echo "  2) node scripts/platform/build-sip-ladder.cjs $OUT_DIR/merged.log [callid-substring]"
echo "  3) Telnyx Call Control logs are NOT in this capture — pull the matching"
echo "     Call Control Detail Record from https://portal.telnyx.com (Reporting"
echo "     > Call Detail Records, or GET /v2/detail_records via the Telnyx API)"
echo "     for the same call_id / time window: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
