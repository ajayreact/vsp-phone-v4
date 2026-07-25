#!/bin/bash
set -uo pipefail
CALLID="eFeQm14rtmbBKacYsNpeTg"
awk -v RS="" -v ORS="\n\n===PKT===\n\n" "/${CALLID}/" /tmp/fixval-extract.txt > /tmp/fixval-call-packets.txt
wc -l /tmp/fixval-call-packets.txt
grep -c "===PKT===" /tmp/fixval-call-packets.txt
