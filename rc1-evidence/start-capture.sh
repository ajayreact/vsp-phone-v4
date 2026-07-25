#!/bin/bash
set -uo pipefail
sudo bash -c 'setsid tcpdump -i ens5 -tttt -nn -s0 -w /tmp/telnyx-fix-validation.pcap host 192.76.120.10 or host 122.177.247.143 < /dev/null > /tmp/tcpdump-fixval.log 2>&1 &'
sleep 1
ps aux | grep tcpdump | grep -v grep
