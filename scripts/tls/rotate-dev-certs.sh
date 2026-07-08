#!/usr/bin/env bash
# Rotate development leaf certificates (keeps CA unless --rotate-ca).
# Usage: ./scripts/tls/rotate-dev-certs.sh [--rotate-ca]
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROTATE_CA=0
for arg in "$@"; do
  [[ "$arg" == "--rotate-ca" ]] && ROTATE_CA=1
done

LIVE="${ROOT_DIR}/infrastructure/tls/${TLS_ENV:-development}/live"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="${ROOT_DIR}/infrastructure/tls/var/backup-${STAMP}"

mkdir -p "${BACKUP}"
if [[ -d "${LIVE}" ]]; then
  cp -a "${LIVE}" "${BACKUP}/live"
  echo "[ok] backed up live → ${BACKUP}/live"
fi

if [[ ${ROTATE_CA} -eq 1 ]]; then
  rm -rf "${LIVE}"
  "${ROOT_DIR}/scripts/tls/generate-dev-certs.sh" --force
else
  # Rotate leaves only
  for name in api admin sip wss prov kamailio; do
    rm -rf "${LIVE}/${name}"
  done
  "${ROOT_DIR}/scripts/tls/generate-dev-certs.sh" --force
fi

echo "[ok] rotation complete. Previous material: ${BACKUP}"
echo "Strategy note: dual-publish period (old+new) is operational — reload Kamailio/API after copy."
