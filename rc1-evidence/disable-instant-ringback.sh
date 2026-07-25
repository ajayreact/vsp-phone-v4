#!/bin/bash
set -euo pipefail
cd /opt/vsp-phone-v4
K=$(grep -m1 '^TELNYX_API_KEY=' .env | cut -d= -f2-)
CONN=2982156817053779933

echo "=== BEFORE ==="
curl -sS -H "Authorization: Bearer ${K}" \
  "https://api.telnyx.com/v2/credential_connections/${CONN}" | \
  python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; print("instant_ringback_enabled=", d["outbound"].get("instant_ringback_enabled")); print("generate_ringback_tone=", d["outbound"].get("generate_ringback_tone"))'

echo "=== PATCH instant_ringback_enabled=false ==="
curl -sS -X PATCH -H "Authorization: Bearer ${K}" -H "Content-Type: application/json" \
  "https://api.telnyx.com/v2/credential_connections/${CONN}" \
  -d '{"outbound":{"instant_ringback_enabled":false}}' -o /tmp/telnyx-conn-patch.json -w "HTTP=%{http_code}\n"

python3 - <<'PY'
import json
d=json.load(open('/tmp/telnyx-conn-patch.json'))
if 'errors' in d:
  print('ERRORS', d['errors'])
else:
  ob=d['data']['outbound']
  print('AFTER instant_ringback_enabled=', ob.get('instant_ringback_enabled'))
  print('AFTER generate_ringback_tone=', ob.get('generate_ringback_tone'))
PY
