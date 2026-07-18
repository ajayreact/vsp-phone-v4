#!/usr/bin/env bash
# VSP Phone v4 RC1 — nginx duplicate vhost cleanup + canonical config install
# Run on EC2: sudo bash infrastructure/nginx/deploy-nginx.sh
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
CANONICAL="${REPO_ROOT}/infrastructure/nginx/vsp-phone-v4.conf"
ENABLED="/etc/nginx/sites-enabled/vsp-phone-v4.conf"
AVAILABLE="/etc/nginx/sites-available/vsp-phone-v4.conf"
BACKUP_DIR="/etc/nginx/backup-$(date +%Y%m%d-%H%M%S)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

if [[ ! -f "${CANONICAL}" ]]; then
  echo "Missing ${CANONICAL} — git pull on ${REPO_ROOT} first"
  exit 1
fi

echo "=== 1. Duplicate server_name audit ==="
grep -rn "server_name" /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d 2>/dev/null \
  | grep -v "#" || true

echo ""
echo "=== 2. Backup existing nginx config ==="
mkdir -p "${BACKUP_DIR}"
cp -a /etc/nginx/nginx.conf "${BACKUP_DIR}/" 2>/dev/null || true
cp -a /etc/nginx/sites-enabled "${BACKUP_DIR}/sites-enabled" 2>/dev/null || true
cp -a /etc/nginx/sites-available "${BACKUP_DIR}/sites-available" 2>/dev/null || true
cp -a /etc/nginx/conf.d "${BACKUP_DIR}/conf.d" 2>/dev/null || true
echo "Backup: ${BACKUP_DIR}"

echo ""
echo "=== 3. Disable duplicate vhosts (keep only vsp-phone-v4) ==="
mkdir -p /etc/nginx/sites-enabled /etc/nginx/sites-available

# Remove ALL enabled sites (duplicates cause conflicting server_name warnings)
find /etc/nginx/sites-enabled -maxdepth 1 -type f -exec mv {} "${BACKUP_DIR}/sites-enabled/" \; 2>/dev/null || true
find /etc/nginx/sites-enabled -maxdepth 1 -type l -exec rm -f {} \; 2>/dev/null || true

# Disable conf.d snippets that define the same server_names
if [[ -d /etc/nginx/conf.d ]]; then
  for f in /etc/nginx/conf.d/*.conf; do
    [[ -f "$f" ]] || continue
    if grep -qE 'server_name.*(api|app|admin)\.vspphone\.com|vspphone\.com' "$f" 2>/dev/null; then
      mv "$f" "${BACKUP_DIR}/conf.d/$(basename "$f")"
      echo "Disabled conf.d: $(basename "$f")"
    fi
  done
fi

echo ""
echo "=== 4. Install canonical config ==="
cp "${CANONICAL}" "${AVAILABLE}"
ln -sf "${AVAILABLE}" "${ENABLED}"

echo ""
echo "=== 5. Patch SSL paths if using wildcard cert ==="
# If all domains share one cert (e.g. certbot -d '*.vspphone.com' -d vspphone.com):
WILDCARD_CERT="/etc/letsencrypt/live/vspphone.com/fullchain.pem"
WILDCARD_KEY="/etc/letsencrypt/live/vspphone.com/privkey.pem"
if [[ -f "${WILDCARD_CERT}" && -f "${WILDCARD_KEY}" ]]; then
  echo "Using wildcard/apex cert for all server blocks"
  sed -i "s|/etc/letsencrypt/live/api.vspphone.com/fullchain.pem|${WILDCARD_CERT}|g" "${AVAILABLE}"
  sed -i "s|/etc/letsencrypt/live/api.vspphone.com/privkey.pem|${WILDCARD_KEY}|g" "${AVAILABLE}"
  sed -i "s|/etc/letsencrypt/live/app.vspphone.com/fullchain.pem|${WILDCARD_CERT}|g" "${AVAILABLE}"
  sed -i "s|/etc/letsencrypt/live/app.vspphone.com/privkey.pem|${WILDCARD_KEY}|g" "${AVAILABLE}"
  sed -i "s|/etc/letsencrypt/live/admin.vspphone.com/fullchain.pem|${WILDCARD_CERT}|g" "${AVAILABLE}"
  sed -i "s|/etc/letsencrypt/live/admin.vspphone.com/privkey.pem|${WILDCARD_KEY}|g" "${AVAILABLE}"
  sed -i "s|/etc/letsencrypt/live/tenant.vspphone.com/fullchain.pem|${WILDCARD_CERT}|g" "${AVAILABLE}"
  sed -i "s|/etc/letsencrypt/live/tenant.vspphone.com/privkey.pem|${WILDCARD_KEY}|g" "${AVAILABLE}"
  sed -i "s|/etc/letsencrypt/live/prov.vspphone.com/fullchain.pem|${WILDCARD_CERT}|g" "${AVAILABLE}"
  sed -i "s|/etc/letsencrypt/live/prov.vspphone.com/privkey.pem|${WILDCARD_KEY}|g" "${AVAILABLE}"
fi

# Fallback: use first available certbot cert if per-host paths missing
for pair in "api.vspphone.com" "app.vspphone.com" "admin.vspphone.com" "tenant.vspphone.com" "prov.vspphone.com" "vspphone.com"; do
  if [[ ! -f "/etc/letsencrypt/live/${pair}/fullchain.pem" ]]; then
    echo "WARN: missing cert for ${pair} — run certbot or adjust ssl_certificate paths"
  fi
done

echo ""
echo "=== 6. Test and reload nginx ==="
nginx -t
systemctl reload nginx
systemctl status nginx --no-pager | head -5

echo ""
echo "=== 7. Upstream connectivity (from host) ==="
curl -sf -o /dev/null -w "API direct:  %{http_code}\n" http://127.0.0.1:3000/api/health || echo "API direct: FAIL"
curl -s -o /dev/null -w "Admin direct: %{http_code}\n" http://127.0.0.1:3001/api/health || echo "Admin direct: FAIL"
curl -sk -o /dev/null -w "Prov edge :3444/health: %{http_code}\n" https://127.0.0.1:3444/health || echo "Prov edge :3444/health: FAIL"

echo ""
echo "=== 8. External verification ==="
curl -sk -o /dev/null -w "api.vspphone.com /api/ready: %{http_code}\n" https://api.vspphone.com/api/ready || true
if ! curl -sk -o /dev/null -w "%{http_code}" https://api.vspphone.com/api/ready | grep -q 200; then
  echo "API proxy failed — last nginx errors:"
  tail -15 /var/log/nginx/error.log 2>/dev/null || true
fi
curl -sk -o /dev/null -w "app.vspphone.com:            %{http_code}\n" https://app.vspphone.com/ || true
curl -sk -o /dev/null -w "admin.vspphone.com:          %{http_code}\n" https://admin.vspphone.com/ || true
curl -sk -o /dev/null -w "prov.vspphone.com /health:   %{http_code}\n" https://prov.vspphone.com/health || true

echo ""
echo "Done. If 502 persists, check: journalctl -u nginx -n 30"
echo "Backup retained at: ${BACKUP_DIR}"
