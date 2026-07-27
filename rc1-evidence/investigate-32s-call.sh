#!/usr/bin/env bash
# Deep investigation for one Call-ID: Kamailio, RTPengine, Telnyx CDR, session tree.
set -euo pipefail
cd /opt/vsp-phone-v4
CALLID="${1:?usage: investigate-32s-call.sh <sip-call-id>}"
OUT="/tmp/investigate-${CALLID//[@.]/_}"
mkdir -p "$OUT"
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2- | tr -d $'\r"')

echo "=== Call-ID: $CALLID ==="
echo "OUT=$OUT"

echo "=== Kamailio (full) ===" | tee "$OUT/kamailio.txt"
docker logs --timestamps vsp-kamailio 2>&1 | grep -F "$CALLID" | tee -a "$OUT/kamailio.txt" || true

echo "=== RTPengine ===" | tee "$OUT/rtpengine.txt"
docker logs --timestamps vsp-rtpengine 2>&1 | grep -F "$CALLID" | tee -a "$OUT/rtpengine.txt" || true

echo "=== Telnyx CDR (full JSON) ===" | tee "$OUT/cdr.json"
curl -sS -G -H "Authorization: Bearer ${K}" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "filter[sip_call_id]=${CALLID}" \
  "https://api.telnyx.com/v2/detail_records" -o "$OUT/cdr.json"
python3 - <<PY
import json
rows = json.load(open("$OUT/cdr.json")).get("data") or []
r = next((x for x in rows if x.get("sip_call_id") == "$CALLID"), rows[0] if rows else {})
for k in sorted(r.keys()):
    print(f"  {k}: {r[k]}")
sid = r.get("telnyx_session_id")
if sid:
    open("$OUT/session_id.txt","w").write(sid)
PY

if [[ -f "$OUT/session_id.txt" ]]; then
  SID=$(cat "$OUT/session_id.txt")
  FIN=$(python3 -c "import json; r=json.load(open('$OUT/cdr.json'))['data'][0]; print(r.get('finished_at',''))")
  echo "=== Telnyx session tree $SID ===" | tee "$OUT/session-tree.txt"
  curl -sS -H "Authorization: Bearer ${K}" \
    "https://api.telnyx.com/v2/session_analysis/call-session/${SID}?include_children=true&max_depth=5&expand=record&date_time=${FIN}" \
    -o "$OUT/session-tree.json"
  python3 - <<PY
import json, os
out = "$OUT"
def walk(n, d=0):
    if not n: return
    rec = n.get("record") or {}
    print("  "*d + f"{n.get('id')} flow={rec.get('flow_source')} dir={rec.get('leg_direction')} conn={rec.get('connected')} hangup={rec.get('hangup_cause')} details={rec.get('hangup_details')} call_sec={rec.get('call_sec')} err={rec.get('telnyx_error_code')}")
    for c in n.get("children") or []: walk(c, d+1)
root = json.load(open(os.path.join(out, "session-tree.json")))
data = root.get("data") or root
walk(data)
PY
fi

echo "=== Timing analysis ===" | tee "$OUT/timing.txt"
grep -E 'carrier 200 OK|carrier local ACK|carrier uac ACK|BYE received|rtpengine_answer.*200|rtpengine_delete' "$OUT/kamailio.txt" \
  | tee -a "$OUT/timing.txt" || true

echo "Done — $OUT"
