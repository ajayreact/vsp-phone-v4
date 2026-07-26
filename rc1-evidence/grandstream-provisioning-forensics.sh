#!/usr/bin/env bash
# Grandstream provisioning lifecycle forensics — MAC EC74D751E3E7
# Run on EC2 during a controlled phone reboot. Does NOT modify platform code.
#
# Usage:
#   export MAC=ec74d751e3e7
#   export PHONE_IP=122.177.247.143
#   export PROV_URL=https://prov.vspphone.com/gs/ec74d751e3e7/cfg.xml
#   ./grandstream-provisioning-forensics.sh phase1   # before reboot
#   ./grandstream-provisioning-forensics.sh phase2   # start capture, then reboot phone
#   ./grandstream-provisioning-forensics.sh phase3   # after phone export uploaded to OUTDIR
set -euo pipefail

MAC="${MAC:-ec74d751e3e7}"
PHONE_IP="${PHONE_IP:-122.177.247.143}"
PROV_URL="${PROV_URL:-https://prov.vspphone.com/gs/${MAC}/cfg.xml}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUTDIR="${OUTDIR:-/tmp/gs-prov-forensics-${MAC}-${TS}}"
mkdir -p "$OUTDIR"

phase1_before_reboot() {
  echo "=== PHASE 1 — Before reboot (baseline cfg.xml) ==="
  echo "OUTDIR=$OUTDIR"

  curl -sk "$PROV_URL" -o "$OUTDIR/cfg-served.xml"
  HTTP_CODE=$(curl -sk -o /dev/null -w '%{http_code}' "$PROV_URL")
  SIZE=$(wc -c < "$OUTDIR/cfg-served.xml" | tr -d ' ')
  SHA=$(sha256sum "$OUTDIR/cfg-served.xml" | awk '{print $1}')

  cat > "$OUTDIR/baseline.json" <<EOF
{
  "mac": "$MAC",
  "provUrl": "$PROV_URL",
  "capturedAtUtc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "httpStatus": $HTTP_CODE,
  "bytes": $SIZE,
  "sha256": "$SHA"
}
EOF

  echo "HTTP status: $HTTP_CODE"
  echo "Size bytes:  $SIZE"
  echo "SHA-256:     $SHA"
  echo "Saved:       $OUTDIR/cfg-served.xml"
  echo "$SHA  cfg-served.xml" > "$OUTDIR/SHA256SUMS"

  # Snapshot current API provisioning meta from logs (last 20 events for this MAC)
  if docker ps --format '{{.Names}}' | grep -q '^vsp-api$'; then
    docker logs vsp-api 2>&1 | grep -iE "$MAC|provisioning\.(downloaded|request|generate)" | tail -40 \
      > "$OUTDIR/api-prov-history-before.txt" || true
  fi

  echo
  echo "NEXT: run phase2, reboot the GRP2601 when prompted."
}

phase2_during_reboot() {
  echo "=== PHASE 2 — During reboot (capture provisioning traffic) ==="
  echo "OUTDIR=$OUTDIR"
  CAPTURE="$OUTDIR/reboot-capture"
  mkdir -p "$CAPTURE"

  cat > "$CAPTURE/README.txt" <<EOF
Start time (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)
Phone public IP:  $PHONE_IP
MAC:              $MAC
Prov URL:         $PROV_URL

Reboot the Grandstream NOW. Capture runs 8 minutes.
EOF

  # API structured logs (provisioning.request + provisioning.downloaded)
  (
    echo "=== API log capture started $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
    timeout 480 docker logs -f vsp-api 2>&1 | grep -iE \
      "provisioning\.(request|downloaded|auth\.mac_url|credentials\.rehydrated)|$MAC|GRP2601|Grandstream" \
      || true
  ) > "$CAPTURE/api-prov-stream.log" &
  API_PID=$!

  # Nginx access log (prov host) if present
  if [ -f /var/log/nginx/access.log ]; then
    (
      echo "=== nginx access capture started $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
      timeout 480 tail -f /var/log/nginx/access.log 2>/dev/null | grep -iE "prov\.|/gs/|$MAC|3444" \
        || true
    ) > "$CAPTURE/nginx-prov-stream.log" &
    NGINX_PID=$!
  else
    NGINX_PID=""
    echo "nginx access.log not found — skip nginx capture" | tee -a "$CAPTURE/README.txt"
  fi

  # Packet capture: phone -> prov HTTPS + SIP REGISTER path
  if command -v tcpdump >/dev/null 2>&1; then
    IFACE=$(ip route get "$PHONE_IP" 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')
    IFACE="${IFACE:-any}"
    timeout 480 tcpdump -i "$IFACE" -nn -tttt -s0 -w "$CAPTURE/prov-and-sip.pcap" \
      "host $PHONE_IP and (tcp port 443 or tcp port 3444 or udp port 5060)" 2>"$CAPTURE/tcpdump.stderr" &
    PCAP_PID=$!
  else
    PCAP_PID=""
  fi

  echo "Capture running 8 minutes. REBOOT THE PHONE NOW."
  sleep 480

  kill "$API_PID" 2>/dev/null || true
  [ -n "$NGINX_PID" ] && kill "$NGINX_PID" 2>/dev/null || true
  [ -n "$PCAP_PID" ] && kill "$PCAP_PID" 2>/dev/null || true

  # Normalize API log lines into CSV
  python3 - "$CAPTURE/api-prov-stream.log" "$CAPTURE/provisioning-events.csv" <<'PY'
import json, re, sys
from datetime import datetime

inp, outp = sys.argv[1], sys.argv[2]
rows = []
for line in open(inp, encoding="utf-8", errors="replace"):
    m = re.search(r'\{.*\}', line)
    if not m:
        continue
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        continue
    ev = obj.get("event", "")
    if not ev.startswith("provisioning."):
        continue
    rows.append({
        "timestamp_utc": datetime.utcnow().isoformat() + "Z",
        "event": ev,
        "mac": obj.get("mac", ""),
        "userAgent": obj.get("userAgent", ""),
        "httpStatus": obj.get("httpStatus", ""),
        "requestId": obj.get("requestId", ""),
        "requestedUri": obj.get("requestedUri", obj.get("normalizedUri", "")),
        "srcIp": obj.get("srcIp", ""),
    })

with open(outp, "w", encoding="utf-8") as f:
    f.write("timestamp_utc,event,mac,userAgent,httpStatus,requestId,requestedUri,srcIp\n")
    for r in rows:
        f.write(",".join(str(r[k]).replace(",", ";") for k in r) + "\n")
print(f"Wrote {len(rows)} events to {outp}")
PY

  echo "Capture complete: $CAPTURE"
  echo "NEXT: export phone config (see GRANDSTREAM-PROVISIONING-FORENSICS.md), copy to $OUTDIR/phone-export.xml"
  echo "Then: ./grandstream-provisioning-forensics.sh phase3"
}

phase3_compare() {
  echo "=== PHASE 3 — Compare served cfg vs phone export ==="
  SERVED="$OUTDIR/cfg-served.xml"
  PHONE="${PHONE_EXPORT:-$OUTDIR/phone-export.xml}"

  if [ ! -f "$SERVED" ]; then
    echo "Missing $SERVED — run phase1 first" >&2
    exit 1
  fi
  if [ ! -f "$PHONE" ]; then
    echo "Missing phone export: $PHONE" >&2
    echo "Upload phone-export.xml to $OUTDIR or set PHONE_EXPORT=" >&2
    exit 1
  fi

  python3 "$(dirname "$0")/compare-grandstream-provision.py" \
    --served "$SERVED" \
    --phone "$PHONE" \
    --out "$OUTDIR/pvalue-forensics"

  echo "Reports written under $OUTDIR/pvalue-forensics/"
}

case "${1:-}" in
  phase1) phase1_before_reboot ;;
  phase2) phase2_during_reboot ;;
  phase3) phase3_compare ;;
  *)
    echo "Usage: $0 phase1|phase2|phase3"
    exit 1
    ;;
esac
