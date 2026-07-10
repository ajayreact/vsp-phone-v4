#!/usr/bin/env bash
# RC3 — backup PostgreSQL, Redis, and rtpengine recording spool
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${ROOT}/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${BACKUP_DIR}/${STAMP}"
COMPOSE="docker compose -f ${ROOT}/docker-compose.yml -f ${ROOT}/docker-compose.prod.yml"

mkdir -p "${DEST}"

echo "[backup] writing to ${DEST}"

echo "[backup] postgres dump"
${COMPOSE} exec -T postgres pg_dump -U "${POSTGRES_USER:-vsp}" "${POSTGRES_DB:-vsp_phone}" \
  | gzip > "${DEST}/postgres.sql.gz"

echo "[backup] redis RDB"
${COMPOSE} exec -T redis redis-cli SAVE
${COMPOSE} cp redis:/data/dump.rdb "${DEST}/redis-dump.rdb" 2>/dev/null || \
  echo "[backup] warn: redis dump copy skipped"

echo "[backup] rtpengine spool listing"
${COMPOSE} exec -T rtpengine sh -c 'find /var/spool/rtpengine -type f 2>/dev/null | head -100' \
  > "${DEST}/rtpengine-spool-manifest.txt" || true

cat > "${DEST}/manifest.json" <<EOF
{
  "timestamp": "${STAMP}",
  "components": ["postgres", "redis", "rtpengine-spool-manifest"]
}
EOF

echo "[backup] complete → ${DEST}"
