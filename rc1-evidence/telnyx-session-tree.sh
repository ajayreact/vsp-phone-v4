#!/usr/bin/env bash
set -euo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2- | tr -d $'\r"')
SESSION_ID="${1:-083f6cc0-8941-11f1-a9f3-620f0d436b61}"
DATE_TIME="${2:-2026-07-26T22:27:00Z}"

URL="https://api.telnyx.com/v2/session_analysis/call-session/${SESSION_ID}?include_children=true&max_depth=5&expand=record&date_time=${DATE_TIME}"
echo "GET $URL"
curl -sS -H "Authorization: Bearer ${K}" "$URL" -o /tmp/session-tree.json
python3 - <<'PY'
import json

def walk(node, depth=0):
    if not node:
        return
    rec = node.get('record') or {}
    indent = '  ' * depth
    print(f"{indent}{node.get('id')} type={node.get('type')} flow={rec.get('flow_source')} dir={rec.get('leg_direction')} conn={rec.get('connected')} hangup={rec.get('hangup_cause')} details={rec.get('hangup_details')} err={rec.get('telnyx_error_code')} call_sec={rec.get('call_sec')} cid={(rec.get('sip_call_id') or '')[:40]}")
    for ch in node.get('children') or []:
        walk(ch, depth + 1)

root = json.load(open('/tmp/session-tree.json'))
data = root.get('data') or root
walk(data)
PY
