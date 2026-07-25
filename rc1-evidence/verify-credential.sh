#!/bin/bash
set -uo pipefail
docker exec vsp-kamailio grep -n 'modparam("uac", "credential"' /etc/kamailio/kamailio.cfg | \
  sed -E 's/(credential", ")[^:]+:[^:]+:[^"]+/\1<user>:<realm>:<redacted>/'
