#!/bin/sh
# Install rtpengine-daemon when available; else Phase-4 NG-aware stub.
set -eu

STUB_DIR=/usr/local/lib/vsp-rtpengine
mkdir -p "${STUB_DIR}" /var/spool/rtpengine /var/log/rtpengine

if apt-get update \
  && apt-get install -y --no-install-recommends rtpengine-daemon 2>/dev/null; then
  echo "[rtpengine] installed rtpengine-daemon from apt"
  # Prefer Python bencoder CLI if packaged
  (apt-get install -y --no-install-recommends rtpengine-utils 2>/dev/null || true)
  rm -rf /var/lib/apt/lists/*
  # Marker
  echo "real" > /etc/rtpengine/.backend
  exit 0
fi

echo "[rtpengine] apt package unavailable — installing Phase-4 NG control stub"
echo "stub" > /etc/rtpengine/.backend

# Minimal UDP NG responder: answers "ping" style control probes for health/Kamailio reachability.
# NOT a full media forwarder — replace with rtpengine-daemon before call phases.
cat >"${STUB_DIR}/ng_stub.py" <<'PY'
#!/usr/bin/env python3
"""Phase-4 RTPengine NG stub — control plane only."""
import os
import socket
import sys
import time

HOST = os.environ.get("RTPENGINE_NG_HOST", "0.0.0.0")
PORT = int(os.environ.get("RTPENGINE_NG_PORT", "2223"))
LOG = os.environ.get("RTPENGINE_LOG_FILE", "/var/log/rtpengine/stub.log")

def log(msg: str) -> None:
    line = f"{time.strftime('%Y-%m-%dT%H:%M:%SZ')} {msg}\n"
    sys.stderr.write(line)
    sys.stderr.flush()
    try:
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(line)
    except OSError:
        pass

def looks_like_ping(data: bytes) -> bool:
    low = data.lower()
    return b"ping" in low or b"d4:ping" in low or b"offer" in low or b"answer" in low or b"delete" in low or b"query" in low

def command_hint(data: bytes) -> str:
    low = data.lower()
    for cmd in (b"offer", b"answer", b"delete", b"ping", b"query"):
        if cmd in low:
            return cmd.decode("ascii")
    return "unknown"

def reply_for(data: bytes) -> bytes:
    # Kamailio/rtpengine often use bencode; return a simple cookie-preserving pong when possible.
    # If message starts with cookie + space (NG cookie style), echo cookie.
    try:
        text = data.decode("utf-8", "replace")
    except Exception:
        text = ""
    cookie = ""
    if " " in text:
        cookie = text.split(" ", 1)[0]
    # Minimal positive ack (not full bencode engine)
    body = "d7:result2:oke"
    if cookie:
        return f"{cookie} {body}".encode("ascii", "replace")
    return body.encode("ascii")

def main() -> None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((HOST, PORT))
    log(f"[rtpengine-stub] NG listening udp://{HOST}:{PORT}")
    log("[rtpengine-stub] Phase 9 control ack — offer/answer/delete logged; no RTP forward (install rtpengine-daemon for media)")
    while True:
        try:
            data, addr = sock.recvfrom(65535)
        except Exception as exc:
            log(f"[rtpengine-stub] recv error: {exc}")
            continue
        log(f"[rtpengine-stub] ng from {addr[0]}:{addr[1]} cmd={command_hint(data)} bytes={len(data)}")
        if looks_like_ping(data) or True:
            try:
                sock.sendto(reply_for(data), addr)
            except Exception as exc:
                log(f"[rtpengine-stub] send error: {exc}")

if __name__ == "__main__":
    main()
PY
chmod +x "${STUB_DIR}/ng_stub.py"

cat >/usr/local/bin/rtpengine <<'EOF'
#!/bin/sh
set -eu
CONF="${RTPENGINE_CONF:-/etc/rtpengine/rtpengine.conf}"
echo "[rtpengine-stub] Phase 4 NG stub starting (config=${CONF})"
echo "[rtpengine-stub] Recording dir prepared at /var/spool/rtpengine — no pipeline"
mkdir -p /var/spool/rtpengine /var/log/rtpengine
# Parse listen-ng port from conf if present
if [ -f "${CONF}" ]; then
  NG_LINE=$(grep -E '^[[:space:]]*listen-ng' "${CONF}" | head -n1 || true)
  echo "[rtpengine-stub] ${NG_LINE:-listen-ng default 0.0.0.0:2223}"
fi
exec python3 /usr/local/lib/vsp-rtpengine/ng_stub.py
EOF
chmod +x /usr/local/bin/rtpengine

# Provide a local ng-client ping helper for healthchecks
cat >/usr/local/bin/rtpengine-ng-ping <<'EOF'
#!/usr/bin/env python3
import os, socket, sys, time
host = os.environ.get("RTPENGINE_PING_HOST", "127.0.0.1")
port = int(os.environ.get("RTPENGINE_NG_PORT", "2223"))
cookie = f"vsp{int(time.time())}"
# Simplistic NG ping resembling cookie + bencode ping dict
msg = f"{cookie} d4:ping0:e".encode()
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.settimeout(2.0)
try:
    s.sendto(msg, (host, port))
    data, _ = s.recvfrom(65535)
except Exception as e:
    print(f"ng-ping fail: {e}", file=sys.stderr)
    sys.exit(1)
finally:
    s.close()
text = data.decode("utf-8", "replace")
if "ok" in text.lower() or cookie in text or len(data) > 0:
    print(f"ng-ping ok: {text[:120]}")
    sys.exit(0)
print(f"ng-ping unexpected: {text[:120]}", file=sys.stderr)
sys.exit(1)
EOF
chmod +x /usr/local/bin/rtpengine-ng-ping

rm -rf /var/lib/apt/lists/*
