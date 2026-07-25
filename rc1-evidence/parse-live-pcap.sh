#!/bin/bash
set -uo pipefail
PCAP=/tmp/telnyx-live.pcap
[ -f "$PCAP" ] || PCAP=/tmp/telnyx-fix-validation.pcap
echo "Using $PCAP ($(wc -c < "$PCAP") bytes)"

for CALL in TLYEOszuw35OP26ZLqtjCg 7CcFblWwADbO_zzMBlSMnQ Qom1HxqXM6mFVNvLVN6Y-A; do
  echo "======== $CALL ========"
  sudo tcpdump -tttt -nn -A -r "$PCAP" 2>/dev/null | \
    awk -v RS="" -v c="$CALL" 'index($0,c){print}' | \
    grep -E '^(2026-|INVITE |ACK |CANCEL |From:|P-Asserted|Call-ID:|CSeq:|SIP/2\.0 )' | head -n 60
  echo
done
