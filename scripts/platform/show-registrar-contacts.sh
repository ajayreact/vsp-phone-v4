#!/usr/bin/env bash
# Show Kamailio's live usrloc registrar contacts for a given extension/AoR —
# read-only, no changes to registrations or credentials.
#
# Usage (on EC2):
#   bash scripts/platform/show-registrar-contacts.sh 100
#   bash scripts/platform/show-registrar-contacts.sh sip:100@vsp-internal.sip.vspphone.com

set -euo pipefail

TARGET="${1:-100}"

echo "=== Full usrloc dump (vsp-kamailio) ==="
if docker exec vsp-kamailio kamcmd ul.dump > /tmp/ul_dump.$$.txt 2>&1; then
  DUMP_OK=1
else
  DUMP_OK=0
fi

if [[ "$DUMP_OK" != "1" ]]; then
  echo "kamcmd ul.dump failed — trying kamctl ul show ..."
  docker exec vsp-kamailio kamctl ul show > /tmp/ul_dump.$$.txt 2>&1 || {
    echo "Both kamcmd and kamctl failed. Is vsp-kamailio running? Is usrloc in memory mode (db_mode=0)?"
    cat /tmp/ul_dump.$$.txt 2>/dev/null || true
    rm -f /tmp/ul_dump.$$.txt
    exit 1
  }
fi

TOTAL_AOR_COUNT=$(grep -Ec '^AOR:' /tmp/ul_dump.$$.txt 2>/dev/null || true)
[[ -z "$TOTAL_AOR_COUNT" ]] && TOTAL_AOR_COUNT=0
echo "Total AoRs currently in usrloc: $TOTAL_AOR_COUNT"

echo
echo "=== Contacts matching '$TARGET' ==="
# kamcmd ul.dump output is a nested key: value block per AoR/contact; grab the
# surrounding context around any line mentioning the target so we see the
# whole contact record (Contact:, Received:, Expires:, User-Agent:, etc).
if grep -n -i -- "$TARGET" /tmp/ul_dump.$$.txt >/dev/null 2>&1; then
  grep -n -i -B2 -A12 -- "$TARGET" /tmp/ul_dump.$$.txt
else
  echo "(no lines matched '$TARGET' in the usrloc dump — extension may not be registered right now)"
fi

echo
echo "=== Contact count for '$TARGET' ==="
CONTACT_COUNT=$(grep -Ec -i -- "^[[:space:]]*Contact:.*$TARGET|AOR::.*$TARGET" /tmp/ul_dump.$$.txt 2>/dev/null || true)
[[ -z "$CONTACT_COUNT" ]] && CONTACT_COUNT=0
echo "$CONTACT_COUNT (best-effort match — inspect the block above for the authoritative list; each 'Contact:' line under this AoR is one registered device)"

rm -f /tmp/ul_dump.$$.txt
