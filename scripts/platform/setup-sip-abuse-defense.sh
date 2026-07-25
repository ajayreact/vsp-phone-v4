#!/usr/bin/env bash
# Single idempotent script implementing the two-tier SIP abuse defense
# recommended by scripts/platform/analyze-sip-abuse.cjs:
#
#   PERMANENT_BLOCK — confirmed high-confidence fraud IPs (passed as args)
#                     get an immediate, persistent iptables DROP.
#   RATE_LIMIT      — everything else that looks scan-like (OPTIONS floods,
#                     malformed SIP, INVITE/REGISTER floods) is handled by a
#                     live fail2ban jail watching Kamailio's log, so it
#                     applies to future offenders too, not just today's list.
#
# Never touches IPs inside infrastructure/kamailio/permissions.address group 1
# (internal/trusted) or group 2 (Telnyx carrier) — those are excluded from
# fail2ban's ignoreip automatically, and this script will refuse to
# permanently block an IP that falls inside either range.
#
# Usage (on EC2, needs sudo):
#   sudo bash scripts/platform/setup-sip-abuse-defense.sh [ip1 ip2 ...]
#
# Safe to re-run — every step is idempotent.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PERMISSIONS_FILE="$REPO_ROOT/infrastructure/kamailio/permissions.address"
MARKER_COMMENT="vsp-sip-abuse-block"
LOG_FILE="/var/log/kamailio-abuse.log"
FORWARDER_UNIT="/etc/systemd/system/kamailio-log-forward.service"
LOGROTATE_FILE="/etc/logrotate.d/kamailio-abuse"
FILTER_SCAN="/etc/fail2ban/filter.d/kamailio-scan.conf"
FILTER_FLOOD="/etc/fail2ban/filter.d/kamailio-flood.conf"
JAIL_FILE="/etc/fail2ban/jail.d/kamailio-abuse.conf"

if [[ "$EUID" -ne 0 ]]; then
  echo "Must run as root (sudo)." >&2
  exit 1
fi

ip_in_cidr() {
  # $1=ip $2=range_ip $3=mask_bits
  python3 - "$1" "$2" "$3" <<'PY' 2>/dev/null || return 1
import sys, socket, struct
ip, rng, mask = sys.argv[1], sys.argv[2], int(sys.argv[3])
def to_int(a):
    return struct.unpack("!I", socket.inet_aton(a))[0]
try:
    m = 0xffffffff if mask == 0 else (0xffffffff << (32 - mask)) & 0xffffffff
    sys.exit(0 if (to_int(ip) & m) == (to_int(rng) & m) else 1)
except Exception:
    sys.exit(1)
PY
}

is_trusted_or_carrier() {
  local ip="$1"
  [[ -f "$PERMISSIONS_FILE" ]] || return 1
  while read -r group rip rmask _rest; do
    [[ "$group" =~ ^# ]] && continue
    [[ -z "$group" || -z "$rip" || -z "$rmask" ]] && continue
    if ip_in_cidr "$ip" "$rip" "$rmask"; then
      return 0
    fi
  done < <(grep -Ev '^\s*#|^\s*$' "$PERMISSIONS_FILE")
  return 1
}

echo "=== Step 1/5: Permanent iptables blocks for confirmed fraud IPs ==="
BLOCKED_ANY=0
for IP in "$@"; do
  if [[ ! "$IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    echo "  SKIP $IP — not a bare IPv4 address"
    continue
  fi
  if is_trusted_or_carrier "$IP"; then
    echo "  REFUSING to block $IP — matches a trusted/carrier range in $PERMISSIONS_FILE"
    continue
  fi
  if iptables -C DOCKER-USER -s "$IP" -j DROP -m comment --comment "$MARKER_COMMENT" 2>/dev/null; then
    echo "  $IP already blocked in DOCKER-USER"
  else
    iptables -I DOCKER-USER 1 -s "$IP" -j DROP -m comment --comment "$MARKER_COMMENT"
    echo "  Blocked $IP in DOCKER-USER"
    BLOCKED_ANY=1
  fi
  if iptables -C INPUT -s "$IP" -j DROP -m comment --comment "$MARKER_COMMENT" 2>/dev/null; then
    echo "  $IP already blocked in INPUT"
  else
    iptables -I INPUT 1 -s "$IP" -j DROP -m comment --comment "$MARKER_COMMENT"
    echo "  Blocked $IP in INPUT"
    BLOCKED_ANY=1
  fi
done
if [[ $# -eq 0 ]]; then
  echo "  (no IPs passed — skipping permanent-block tier; run analyze-sip-abuse.cjs first for a list)"
fi

echo
echo "=== Step 2/5: Log forwarder (docker logs -> plain file for fail2ban) ==="
cat > "$FORWARDER_UNIT" <<UNIT
[Unit]
Description=Forward vsp-kamailio docker logs to a plain file for fail2ban
After=docker.service
Requires=docker.service

[Service]
ExecStart=/bin/bash -c '/usr/bin/docker logs -f --since 0s vsp-kamailio >> $LOG_FILE 2>&1'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
touch "$LOG_FILE"
systemctl daemon-reload
systemctl enable --now kamailio-log-forward.service
echo "  kamailio-log-forward.service enabled + started, writing to $LOG_FILE"

cat > "$LOGROTATE_FILE" <<ROTATE
$LOG_FILE {
    daily
    rotate 7
    compress
    missingok
    notifempty
    copytruncate
}
ROTATE
echo "  logrotate config written: $LOGROTATE_FILE"

echo
echo "=== Step 3/5: Install fail2ban if missing ==="
if ! command -v fail2ban-client >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y fail2ban
else
  echo "  fail2ban already installed"
fi

echo
echo "=== Step 4/5: fail2ban filters + jail (rate-limit tier) ==="

cat > "$FILTER_SCAN" <<'FILTER'
# Matches SIP scanner / malformed-message / flood-tripped signatures logged
# by infrastructure/kamailio/kamailio.cfg — low threshold, high confidence.
[Definition]
failregex = ^.*OPTIONS health from <HOST>:\d+.*$
            ^.*Malformed SIP from <HOST>:\d+.*$
            ^.*PIKE block <HOST>:\d+ method=\S+.*$
ignoreregex =
FILTER

cat > "$FILTER_FLOOD" <<'FILTER'
# Matches high-volume INVITE/REGISTER traffic per source — rate-limits
# noisy sources (dial-string brute force, register brute force) without
# permanently blocking, in case some traffic is legitimate retry behavior.
[Definition]
failregex = ^.*INVITE r-uri=\S+ from=\S+ to=\S+ callid=\S+ src=<HOST>.*$
            ^.*REGISTER aor=\S+ contact=\S+ expires=\S* proto=\S+ src=<HOST>.*$
ignoreregex =
FILTER

# Build ignoreip dynamically from permissions.address (group 1 = internal,
# group 2 = Telnyx carrier) so fail2ban can NEVER ban trusted/carrier ranges,
# plus the standard loopback/private defaults.
IGNORE_IPS="127.0.0.1/8 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16"
if [[ -f "$PERMISSIONS_FILE" ]]; then
  while read -r group rip rmask _rest; do
    [[ "$group" =~ ^# || -z "$group" ]] && continue
    IGNORE_IPS="$IGNORE_IPS $rip/$rmask"
  done < <(grep -Ev '^\s*#|^\s*$' "$PERMISSIONS_FILE")
fi
# de-dup
IGNORE_IPS="$(echo "$IGNORE_IPS" | tr ' ' '\n' | sort -u | tr '\n' ' ' | sed 's/ *$//')"

cat > "$JAIL_FILE" <<JAIL
# Auto-generated by scripts/platform/setup-sip-abuse-defense.sh — re-run that
# script to regenerate (e.g. after editing permissions.address).
[kamailio-scan]
enabled  = true
filter   = kamailio-scan
logpath  = $LOG_FILE
backend  = auto
maxretry = 5
findtime = 600
bantime  = 3600
action   = iptables-allports[name=kamailio-scan]
ignoreip = $IGNORE_IPS

[kamailio-flood]
enabled  = true
filter   = kamailio-flood
logpath  = $LOG_FILE
backend  = auto
maxretry = 30
findtime = 120
bantime  = 1800
action   = iptables-allports[name=kamailio-flood]
ignoreip = $IGNORE_IPS
JAIL
echo "  Wrote $FILTER_SCAN, $FILTER_FLOOD, $JAIL_FILE"
echo "  ignoreip = $IGNORE_IPS"

systemctl enable --now fail2ban
systemctl restart fail2ban
sleep 1
echo
echo "  fail2ban jail status:"
fail2ban-client status kamailio-scan 2>/dev/null || echo "  (kamailio-scan not yet reporting — check 'fail2ban-client status')"
fail2ban-client status kamailio-flood 2>/dev/null || echo "  (kamailio-flood not yet reporting — check 'fail2ban-client status')"

echo
echo "=== Step 5/5: Persist iptables rules ==="
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save
  echo "  Persisted via netfilter-persistent."
else
  echo "  netfilter-persistent not found — install with: sudo apt-get install -y iptables-persistent"
fi

echo
echo "Done. Re-run this script any time to add more permanent-block IPs (idempotent)."
echo "Check live fail2ban bans with: sudo fail2ban-client status kamailio-scan / kamailio-flood"
