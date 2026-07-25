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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo
echo "=== Parsed usrloc (target='$TARGET') ==="
if command -v node >/dev/null 2>&1; then
  node "$SCRIPT_DIR/parse-usrloc-dump.cjs" /tmp/ul_dump.$$.txt "$TARGET"
else
  echo "node not found on this host — showing raw grep context instead."
  grep -n -i -B2 -A12 -- "$TARGET" /tmp/ul_dump.$$.txt || echo "(no lines matched '$TARGET')"
fi

rm -f /tmp/ul_dump.$$.txt
