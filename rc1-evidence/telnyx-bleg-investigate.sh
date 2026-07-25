#!/usr/bin/env bash
# Telnyx B-leg investigation — read-only API queries, no Kamailio changes
set -euo pipefail
cd /opt/vsp-phone-v4

CALL_PREFIX="${1:-TLYEOszuw35OP26ZLqtjCg}"
SESSION_ID="${2:-9a673e20-885b-11f1-9f61-02420aef93a0}"
LEG_ID="${3:-9a674ce4-885b-11f1-8b7b-02420aef93a0}"
DATE_TIME="${4:-2026-07-25T19:04:03Z}"

K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
AUTH=(-H "Authorization: Bearer ${K}")

echo "=== Telnyx B-leg Investigation ==="
echo "Call-ID prefix: ${CALL_PREFIX}"
echo "telnyx_session_id: ${SESSION_ID}"
echo "sip-trunking leg id: ${LEG_ID}"
echo "date_time hint: ${DATE_TIME}"
echo

api() {
  local name="$1"; shift
  local out="/tmp/telnyx-bleg-${name}.json"
  echo "--- ${name} ---"
  echo "GET $*"
  local code
  code=$(curl -sS -w '%{http_code}' -o "$out" "${AUTH[@]}" "$@") || true
  echo "HTTP ${code} -> ${out}"
  echo
}

# 1) Full detail record dump (all fields)
api cdr-list \
  -G "https://api.telnyx.com/v2/detail_records" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "page[size]=50"

api cdr-by-id \
  -G "https://api.telnyx.com/v2/detail_records" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "filter[id]=${LEG_ID}"

api cdr-by-session \
  -G "https://api.telnyx.com/v2/detail_records" \
  --data-urlencode "filter[record_type]=sip-trunking" \
  --data-urlencode "filter[telnyx_session_id]=${SESSION_ID}"

# 2) Session analysis trees
api session-call-session \
  "https://api.telnyx.com/v2/session_analysis/call-session/${SESSION_ID}?include_children=true&max_depth=5&expand=record&date_time=${DATE_TIME}"

api session-sip-trunking \
  "https://api.telnyx.com/v2/session_analysis/sip-trunking/${LEG_ID}?include_children=true&max_depth=5&expand=record&date_time=${DATE_TIME}"

# 3) Connection + outbound profile settings
api credential-conn \
  "https://api.telnyx.com/v2/credential_connections/2982156817053779933"

# 4) Try debug SIP call flow API variants (may 404 — report status)
for path in \
  "https://api.telnyx.com/v2/debug/sip_call_flows?filter[sip_call_id]=${CALL_PREFIX}.." \
  "https://api.telnyx.com/v2/debug/sip_call_flow/${SESSION_ID}" \
  "https://api.telnyx.com/v2/sip_call_flows?filter[telnyx_session_id]=${SESSION_ID}"; do
  name=$(echo "$path" | sed 's|https://api.telnyx.com/v2/||; s|/|_|g; s|?.*||')
  api "debug-${name}" "$path" || true
done

python3 - <<'PY'
import json, os, sys
from pathlib import Path

CALL_PREFIX = os.environ.get("CALL_PREFIX", "TLYEOszuw35OP26ZLqtjCg")
SESSION_ID = os.environ.get("SESSION_ID", "9a673e20-885b-11f1-9f61-02420aef93a0")
LEG_ID = os.environ.get("LEG_ID", "9a674ce4-885b-11f1-8b7b-02420aef93a0")

def load(p):
    try:
        return json.load(open(p))
    except Exception as e:
        return {"_error": str(e), "_path": p}

def dump_record(label, rec):
    if not rec or rec.get("_error"):
        print(f"\n### {label}: MISSING ({rec})")
        return
    print(f"\n### {label}")
    for k in sorted(rec.keys()):
        v = rec[k]
        if v in (None, "", [], {}):
            continue
        print(f"  {k}: {v}")

# --- CDR match ---
cdr = load("/tmp/telnyx-bleg-cdr-list.json")
match = None
for r in cdr.get("data") or []:
    sid = r.get("sip_call_id") or ""
    if sid.startswith(CALL_PREFIX):
        match = r
        break
dump_record("SIP Trunking Detail Record (matched by sip_call_id)", match)

if match:
    print("\n### Carrier / hangup / alerting fields (explicit)")
    keys = [
        "attempted", "connected", "completed", "hangup_cause", "hangup_code",
        "hangup_details", "sip_invite_failure_status", "telnyx_error_code",
        "telnyx_error_message", "route", "lrn", "dest_number", "onnet",
        "has_telnyx_retried_internally", "shaken_stir", "call_sec", "billed_sec",
        "started_at", "finished_at", "fs_channel_id", "is_callcontrol",
        "orig_jip", "sip_from_url", "sip_full_to", "term_lrn_state",
        "term_lrn_city", "term_lrn_ocn", "term_lrn_lata", "outbound_profile_id",
    ]
    for k in keys:
        if k in match:
            print(f"  {k}: {match.get(k)}")

# --- Session analysis flatten ---
def walk(node, depth=0, lines=None):
    if lines is None:
        lines = []
    if not isinstance(node, dict):
        return lines
    indent = "  " * depth
    nid = node.get("id", "?")
    product = node.get("product", node.get("event_name", "?"))
    rel = node.get("relationship") or {}
    rel_type = rel.get("type") if isinstance(rel, dict) else rel
    rec = node.get("record") or {}
    summary = []
    for k in ("sip_call_id", "direction", "cli", "cld", "hangup_cause", "hangup_code",
              "hangup_details", "connected", "attempted", "telnyx_error_code",
              "sip_invite_failure_status", "started_at", "finished_at", "route", "lrn"):
        if rec.get(k) not in (None, ""):
            summary.append(f"{k}={rec[k]}")
    lines.append(f"{indent}- {product} id={nid} rel={rel_type} {' | '.join(summary)}")
    for ch in node.get("children") or []:
        walk(ch, depth + 1, lines)
    return lines

for label, path in [
    ("call-session tree", "/tmp/telnyx-bleg-session-call-session.json"),
    ("sip-trunking tree", "/tmp/telnyx-bleg-session-sip-trunking.json"),
]:
    data = load(path)
    print(f"\n### Session Analysis: {label}")
    if data.get("_error"):
        print("  ERROR:", data)
        continue
    if "errors" in data:
        print("  API errors:", json.dumps(data["errors"], indent=2))
        continue
    root = data.get("root") or {}
    for line in walk(root):
        print(line)
    meta = data.get("meta") or {}
    if meta:
        print(f"  meta: {meta}")

# --- Connection outbound settings ---
conn = load("/tmp/telnyx-bleg-credential-conn.json").get("data") or {}
ob = conn.get("outbound") or {}
print("\n### Credential Connection Outbound Settings")
for k in ("connection_name", "active"):
    print(f"  {k}: {conn.get(k)}")
for k in sorted(ob.keys()):
    print(f"  outbound.{k}: {ob.get(k)}")

PY
