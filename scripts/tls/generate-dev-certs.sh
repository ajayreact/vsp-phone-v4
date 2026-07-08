#!/usr/bin/env bash
# Generate VSP Phone v4 development CA + server certificates (OpenSSL).
# Usage: ./scripts/tls/generate-dev-certs.sh [--force]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TLS_ROOT="${ROOT_DIR}/infrastructure/tls"
ENV_NAME="${TLS_ENV:-development}"
LIVE="${TLS_ROOT}/${ENV_NAME}/live"
OPENSSL_DIR="${TLS_ROOT}/openssl"
FORCE=0
DAYS_CA="${TLS_CA_DAYS:-3650}"
DAYS_LEAF="${TLS_CERT_DAYS:-825}"

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
  esac
done

need_openssl() {
  if ! command -v openssl >/dev/null 2>&1; then
    echo "ERROR: openssl not found. Install OpenSSL or use scripts/tls/generate-dev-certs.ps1" >&2
    exit 1
  fi
}

emit_leaf_cnf() {
  local cn="$1"
  local out="$2"
  shift 2
  local san_lines=()
  local i=1
  local dns_i=1
  local ip_i=1
  for entry in "$@"; do
    if [[ "$entry" =~ ^IP: ]]; then
      san_lines+=("IP.${ip_i} = ${entry#IP:}")
      ip_i=$((ip_i + 1))
    else
      san_lines+=("DNS.${dns_i} = ${entry}")
      dns_i=$((dns_i + 1))
    fi
  done
  local san_block
  san_block="$(printf '%s\n' "${san_lines[@]}")"
  sed -e "s/__CN__/${cn}/g" "${OPENSSL_DIR}/server.cnf.template" \
    | awk -v san="$san_block" '
        /^__SAN__$/ { print san; next }
        { print }
      ' >"${out}"
}

issue_leaf() {
  local name="$1"
  local cn="$2"
  shift 2
  local dir="${LIVE}/${name}"
  mkdir -p "${dir}"
  if [[ -f "${dir}/privkey.pem" && ${FORCE} -eq 0 ]]; then
    echo "[skip] ${name} already exists (use --force)"
    return 0
  fi

  local tmp_cnf
  tmp_cnf="$(mktemp)"
  emit_leaf_cnf "${cn}" "${tmp_cnf}" "$@"

  openssl genrsa -out "${dir}/privkey.pem" 2048
  openssl req -new -key "${dir}/privkey.pem" -out "${dir}/csr.pem" -config "${tmp_cnf}"
  openssl x509 -req -in "${dir}/csr.pem" -CA "${LIVE}/ca/ca.crt" -CAkey "${LIVE}/ca/ca.key" \
    -CAcreateserial -out "${dir}/cert.pem" -days "${DAYS_LEAF}" -sha256 \
    -extfile "${tmp_cnf}" -extensions v3_sign
  cat "${dir}/cert.pem" "${LIVE}/ca/ca.crt" >"${dir}/fullchain.pem"
  rm -f "${dir}/csr.pem" "${tmp_cnf}"
  chmod 600 "${dir}/privkey.pem" || true
  chmod 644 "${dir}/cert.pem" "${dir}/fullchain.pem" || true
  echo "[ok] issued ${name} (${cn})"
}

need_openssl
mkdir -p "${LIVE}/ca"

if [[ ! -f "${LIVE}/ca/ca.key" || ${FORCE} -eq 1 ]]; then
  openssl genrsa -out "${LIVE}/ca/ca.key" 4096
  openssl req -x509 -new -nodes -key "${LIVE}/ca/ca.key" -sha256 -days "${DAYS_CA}" \
    -out "${LIVE}/ca/ca.crt" -config "${OPENSSL_DIR}/ca.cnf"
  chmod 600 "${LIVE}/ca/ca.key" || true
  chmod 644 "${LIVE}/ca/ca.crt" || true
  cp "${LIVE}/ca/ca.crt" "${TLS_ROOT}/trust-store/dev-ca.crt"
  echo "[ok] development CA"
else
  echo "[skip] CA exists (use --force)"
  cp -f "${LIVE}/ca/ca.crt" "${TLS_ROOT}/trust-store/dev-ca.crt"
fi

# Shared SAN set for local + Docker DNS names (ADR-025 / Phase 2 lab)
COMMON_SANS=(
  localhost
  127.0.0.1
  IP:127.0.0.1
  api
  admin
  kamailio
  sip
  wss
  prov
  '*.sip.localhost'
  '*.local'
  api.localhost
  sip.localhost
  wss.localhost
  prov.localhost
  host.docker.internal
)

issue_leaf api api.localhost "${COMMON_SANS[@]}"
issue_leaf admin admin.localhost "${COMMON_SANS[@]}"
issue_leaf sip sip.localhost "${COMMON_SANS[@]}"
# WSS uses the SIP certificate by default (same Kamailio listener identity)
mkdir -p "${LIVE}/wss"
if [[ ! -f "${LIVE}/wss/fullchain.pem" || ${FORCE} -eq 1 ]]; then
  cp -f "${LIVE}/sip/cert.pem" "${LIVE}/wss/cert.pem"
  cp -f "${LIVE}/sip/privkey.pem" "${LIVE}/wss/privkey.pem"
  cp -f "${LIVE}/sip/fullchain.pem" "${LIVE}/wss/fullchain.pem"
  chmod 600 "${LIVE}/wss/privkey.pem" || true
  echo "[ok] wss linked to sip leaf"
fi
issue_leaf prov prov.localhost "${COMMON_SANS[@]}"

# Convenience symlinks expected by Kamailio tls.cfg
mkdir -p "${LIVE}/kamailio"
cp -f "${LIVE}/sip/privkey.pem" "${LIVE}/kamailio/privkey.pem"
cp -f "${LIVE}/sip/fullchain.pem" "${LIVE}/kamailio/fullchain.pem"
cp -f "${LIVE}/ca/ca.crt" "${LIVE}/kamailio/ca.crt"
chmod 600 "${LIVE}/kamailio/privkey.pem" || true

cat >"${LIVE}/MANIFEST.txt" <<EOF
generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
tls_env=${ENV_NAME}
ca_days=${DAYS_CA}
leaf_days=${DAYS_LEAF}
leaves=api,admin,sip,wss,prov,kamailio
EOF

echo "Done. Live material: ${LIVE}"
echo "Validate: ./scripts/tls/validate-certs.sh  OR  node scripts/tls/validate-certs.mjs"
