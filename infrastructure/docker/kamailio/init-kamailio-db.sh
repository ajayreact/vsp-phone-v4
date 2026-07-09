#!/bin/sh
# Idempotent Kamailio usrloc PostgreSQL bootstrap (Remediation H-06 / RC1)
set -eu

USRLOC_MODE="${KAMAILIO_USRLOC_PERSISTENCE:-memory}"
if [ "${USRLOC_MODE}" != "postgres" ]; then
  exit 0
fi

DB_URL="${KAMAILIO_USRLOC_DB_URL:-${DATABASE_URL:-}}"
if [ -z "${DB_URL}" ]; then
  echo "[kamailio] ERROR: KAMAILIO_USRLOC_PERSISTENCE=postgres requires KAMAILIO_USRLOC_DB_URL or DATABASE_URL"
  exit 1
fi

# Kamailio db_postgres driver expects postgres:// (not postgresql://).
DB_URL=$(printf '%s' "${DB_URL}" | sed 's|^postgresql://|postgres://|' | sed 's|\?.*||')
SCHEMA_DIR="${KAMAILIO_DB_SCHEMA_DIR:-/etc/kamailio/postgres}"
BOOTSTRAP="${SCHEMA_DIR}/bootstrap-usrloc.sql"

if [ ! -f "${BOOTSTRAP}" ]; then
  echo "[kamailio] ERROR: Kamailio DB bootstrap missing: ${BOOTSTRAP}"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "[kamailio] ERROR: psql required for postgres usrloc bootstrap"
  exit 1
fi

echo "[kamailio] ensuring usrloc postgres schema (idempotent): ${BOOTSTRAP}"
if ! psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${BOOTSTRAP}"; then
  echo "[kamailio] ERROR: Kamailio database bootstrap failed"
  exit 1
fi

echo "[kamailio] verifying version table rows"
psql "${DB_URL}" -v ON_ERROR_STOP=1 -c \
  "SELECT table_name, table_version FROM version WHERE table_name IN ('version', 'location', 'location_attrs') ORDER BY table_name;"

echo "[kamailio] verifying location columns required by Kamailio 5.8"
psql "${DB_URL}" -v ON_ERROR_STOP=1 -c \
  "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='location' AND column_name IN ('instance','reg_id','server_id','connection_id','keepalive','partition') ORDER BY column_name;"

echo "[kamailio] usrloc postgres schema OK"
