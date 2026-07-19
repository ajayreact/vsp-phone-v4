#!/usr/bin/env bash
# Sync Let's Encrypt prov.vspphone.com PEMs into the Nest default mount path.
# Run on EC2 (host) before recreating the API container.
#
# Why copy (-L): LE live/*.pem are symlinks into archive/. Bind-mounting only
# live/prov.vspphone.com → /etc/vsp/tls/prov breaks relative symlink resolution.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/vsp-phone-v4}"
LE_LIVE="${LE_PROV_LIVE:-/etc/letsencrypt/live/prov.vspphone.com}"
DEST="${VSP_PROV_TLS_DIR:-$REPO_ROOT/infrastructure/tls/production/live/prov}"

if [[ ! -f "$LE_LIVE/fullchain.pem" || ! -f "$LE_LIVE/privkey.pem" ]]; then
  echo "ERROR: Let's Encrypt prov certs not found under $LE_LIVE" >&2
  echo "Expected: fullchain.pem privkey.pem (certbot / deploy-nginx.sh)" >&2
  exit 1
fi

mkdir -p "$DEST"
cp -L "$LE_LIVE/fullchain.pem" "$DEST/fullchain.pem"
cp -L "$LE_LIVE/privkey.pem" "$DEST/privkey.pem"
chmod 644 "$DEST/fullchain.pem"
chmod 600 "$DEST/privkey.pem"

echo "Synced LE prov TLS → $DEST"
ls -la "$DEST/fullchain.pem" "$DEST/privkey.pem"
