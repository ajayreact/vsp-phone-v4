#!/bin/sh
# Install rtpengine-daemon when available; stub only when explicitly allowed (lab).
set -eu

REQUIRE="${RTPENGINE_REQUIRE_DAEMON:-0}"
STUB_DIR=/usr/local/lib/vsp-rtpengine
mkdir -p "${STUB_DIR}" /var/spool/rtpengine /var/log/rtpengine

# Our own rtpengine.conf is COPYed into the image before this script runs, so
# apt's conffile prompt would otherwise block a non-interactive build (no stdin).
# --force-confdef/--force-confold: keep our pre-seeded conf, never prompt.
APT_DPKG_OPTS="-o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold"

install_real_daemon() {
  if apt-get install -y --no-install-recommends ${APT_DPKG_OPTS} rtpengine-daemon 2>/dev/null; then
    apt-get install -y --no-install-recommends ${APT_DPKG_OPTS} rtpengine-utils 2>/dev/null || true
    echo "real" > /etc/rtpengine/.backend
    echo "[rtpengine] installed rtpengine-daemon"
    return 0
  fi
  if apt-get install -y --no-install-recommends ${APT_DPKG_OPTS} rtpengine 2>/dev/null; then
    echo "real" > /etc/rtpengine/.backend
    echo "[rtpengine] installed rtpengine metapackage"
    return 0
  fi
  if apt-get install -y --no-install-recommends ${APT_DPKG_OPTS} ngcp-rtpengine-daemon 2>/dev/null; then
    apt-get install -y --no-install-recommends ${APT_DPKG_OPTS} ngcp-rtpengine-utils 2>/dev/null || true
    echo "real" > /etc/rtpengine/.backend
    echo "[rtpengine] installed ngcp-rtpengine-daemon"
    return 0
  fi
  return 1
}

try_apt_direct() {
  apt-get update && install_real_daemon
}

try_dfx_repo() {
  # Official URL moved: https://rtpengine.dfx.at/<REL> (old https://dfx.at/rtpengine 404s).
  REL="${RTPENGINE_DFX_REL:-LTS}"
  DIST=bookworm
  echo "[rtpengine] trying rtpengine.dfx.at/${REL} ${DIST} repository"
  curl -fsSL -o /tmp/rtpengine-dfx-repo-keyring.deb \
    "https://rtpengine.dfx.at/latest/pool/main/r/rtpengine-dfx-repo-keyring/rtpengine-dfx-repo-keyring_1.0_all.deb"
  dpkg -i /tmp/rtpengine-dfx-repo-keyring.deb
  rm -f /tmp/rtpengine-dfx-repo-keyring.deb
  echo "deb [signed-by=/usr/share/keyrings/dfx.at-rtpengine-archive-keyring.gpg] https://rtpengine.dfx.at/${REL} ${DIST} main" \
    > /etc/apt/sources.list.d/dfx.at-rtpengine.list
  apt-get update && install_real_daemon
}

if try_apt_direct || try_dfx_repo; then
  rm -rf /var/lib/apt/lists/*
  exit 0
fi

if [ "${REQUIRE}" = "1" ] || [ "${REQUIRE}" = "true" ]; then
  echo "[rtpengine] FATAL: RTPENGINE_REQUIRE_DAEMON=1 but rtpengine-daemon install failed"
  exit 1
fi

echo "[rtpengine] apt package unavailable — installing lab NG control stub (no RTP forward)"
echo "stub" > /etc/rtpengine/.backend

cat >"${STUB_DIR}/ng_stub.py" <<'PY'
#!/usr/bin/env python3
"""Lab-only RTPengine NG stub — control plane ack only. NOT for production."""
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

def reply_for(data: bytes) -> bytes:
    try:
        text = data.decode("utf-8", "replace")
    except Exception:
        text = ""
    cookie = text.split(" ", 1)[0] if " " in text else ""
    body = "d7:result2:ok"
    if cookie:
        return f"{cookie} {body}".encode("ascii", "replace")
    return body.encode("ascii")

def main() -> None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((HOST, PORT))
    log(f"[rtpengine-stub] NG listening udp://{HOST}:{PORT} — lab only, no media")
    while True:
        data, addr = sock.recvfrom(65535)
        log(f"[rtpengine-stub] ng from {addr[0]}:{addr[1]} bytes={len(data)}")
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
echo "[rtpengine-stub] lab stub — install rtpengine-daemon for production media"
mkdir -p /var/spool/rtpengine /var/log/rtpengine
exec python3 /usr/local/lib/vsp-rtpengine/ng_stub.py
EOF
chmod +x /usr/local/bin/rtpengine

cat >/usr/local/bin/rtpengine-ng-ping <<'EOF'
#!/usr/bin/env python3
import os, socket, sys, time
host = os.environ.get("RTPENGINE_PING_HOST", "127.0.0.1")
port = int(os.environ.get("RTPENGINE_NG_PORT", "2223"))
cookie = f"vsp{int(time.time())}"
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
