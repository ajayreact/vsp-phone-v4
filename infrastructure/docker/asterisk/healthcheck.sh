#!/bin/sh
# Asterisk health — core alive and both PJSIP endpoints configured (ADR-045).
set -eu

if ! asterisk -rx 'core show uptime' >/dev/null 2>&1; then
  echo "[asterisk] unhealthy: control socket not answering"
  exit 1
fi

ENDPOINTS=$(asterisk -rx 'pjsip show endpoints' 2>/dev/null || true)
for ep in kamailio telnyx; do
  if ! printf '%s' "${ENDPOINTS}" | grep -q "Endpoint:  *${ep}"; then
    echo "[asterisk] unhealthy: pjsip endpoint '${ep}' missing"
    exit 1
  fi
done

# Without the identify object Asterisk answers 401 to everything Kamailio sends, while
# still looking perfectly healthy by every other measure. Fail here instead.
if ! asterisk -rx 'pjsip show identifies' 2>/dev/null | grep -q 'kamailio'; then
  echo "[asterisk] unhealthy: kamailio-identify did not load — edge requests will be challenged"
  exit 1
fi

exit 0
