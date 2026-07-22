#!/usr/bin/env bash
# RC1 — verify public SIP ingress to Kamailio (desk phone REGISTER path).
set -euo pipefail

SIP_HOST="${SIP_HOST:-${SIP_REGISTRAR_HOST:-sip.vspphone.com}}"
SIP_PORT="${SIP_PORT:-5060}"

echo "=== SIP ingress check: ${SIP_HOST}:${SIP_PORT} ==="

if command -v dig >/dev/null 2>&1; then
  echo "--- DNS A ---"
  dig +short "${SIP_HOST}" A || true
fi

if command -v nc >/dev/null 2>&1; then
  echo "--- TCP ${SIP_PORT} ---"
  if nc -z -w 3 "${SIP_HOST}" "${SIP_PORT}" 2>/dev/null; then
    echo "PASS: TCP ${SIP_PORT} reachable"
  else
    echo "FAIL: TCP ${SIP_PORT} not reachable (open AWS SG UDP+TCP ${SIP_PORT}; nginx does not proxy SIP)"
    exit 1
  fi
else
  echo "WARN: nc not installed — skip TCP probe"
fi

if [[ -f docker-compose.yml ]]; then
  echo "--- Host listener (optional) ---"
  ss -ulnp 2>/dev/null | grep ":${SIP_PORT} " || echo "WARN: UDP ${SIP_PORT} not bound on host"
fi

echo "OK: SIP ingress probe complete"
