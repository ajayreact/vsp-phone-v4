#!/usr/bin/env bash
# Parse a teardown capture for one Call-ID: SIP ladder, first BYE, session timers.
set -euo pipefail
PCAP="${1:?usage: analyze-call-pcap.sh <pcap> [callid-substring]}"
CALLID="${2:-}"
OUT="${3:-/tmp/analyze-call-$$}"
mkdir -p "$OUT"

log() { echo "[analyze-call] $*"; }

# Full ASCII dump once
sudo tcpdump -nn -tttt -A -s0 -r "$PCAP" 2>/dev/null >"$OUT/ascii.txt" || true

if [[ -n "$CALLID" ]]; then
  awk -v id="$CALLID" 'BEGIN{RS=""; ORS="\n\n---PKT---\n\n"} index($0,id)' "$OUT/ascii.txt" >"$OUT/call-ascii.txt" || true
  SRC="$OUT/call-ascii.txt"
else
  SRC="$OUT/ascii.txt"
fi

log "=== SIP ladder (methods + IP flow) ==="
grep -E '^[0-9]{4}-|^(INVITE|ACK|BYE|CANCEL|UPDATE|NOTIFY|OPTIONS|SIP/2\.0) ' "$SRC" 2>/dev/null \
  | grep -E 'SIP:|^BYE |^ACK |^INVITE |^SIP/2\.0' \
  | head -80 | tee "$OUT/ladder.txt" || true

log "=== First BYE packet (context) ==="
awk '
  /^[0-9]{4}-.*IP / { ts=$0; ip=$0 }
  /^BYE sip:/ { if (!seen++) { print "---"; print ts; print ip; print; show=1; next } }
  show && /^[0-9]{4}-.*IP / && !/^BYE/ { exit }
  show { print }
' "$SRC" | head -60 | tee "$OUT/first-bye.txt" || true

log "=== Session timers ==="
grep -E 'Session-Expires|Min-SE|Supported:.*timer|Require:.*timer|refresher=' "$SRC" \
  | sort -u | tee "$OUT/session-timers.txt" || true

log "=== Reason headers ==="
grep -E '^Reason:' "$SRC" | sort -u | tee "$OUT/reason.txt" || true

log "=== BYE count ==="
grep -c '^BYE sip:' "$SRC" 2>/dev/null | tee "$OUT/bye-count.txt" || echo 0

log "OUT=$OUT"
