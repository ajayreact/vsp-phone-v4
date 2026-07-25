#!/usr/bin/env bash
# Block a SIP-abuse source IP at the OS firewall, in front of Kamailio/Docker.
#
# Context: confirmed toll-fraud probing — unauthenticated INVITEs with a
# forged From: identity (no matching REGISTER, no provisioned extension),
# rapid dial-string permutation against a single PSTN number. Kamailio's
# built-in pike+ipban only bans for 300s (modparam htable ipban autoexpire);
# this makes the block persistent at the packet level, before it reaches
# Docker's published ports at all.
#
# Usage (on EC2, needs sudo):
#   sudo bash scripts/platform/block-sip-source-ip.sh 135.136.19.105
#   sudo bash scripts/platform/block-sip-source-ip.sh 135.136.19.105 --unblock   # remove
#   sudo bash scripts/platform/block-sip-source-ip.sh --list                    # show current blocks

set -euo pipefail

MARKER_COMMENT="vsp-sip-abuse-block"

usage() {
  echo "Usage: $0 <ip> [--unblock] | --list"
  exit 1
}

list_blocks() {
  echo "=== DOCKER-USER DROP rules (comment=$MARKER_COMMENT) ==="
  iptables -L DOCKER-USER -n -v --line-numbers 2>/dev/null | grep -F "$MARKER_COMMENT" || echo "(none)"
  echo
  echo "=== INPUT DROP rules (comment=$MARKER_COMMENT) ==="
  iptables -L INPUT -n -v --line-numbers 2>/dev/null | grep -F "$MARKER_COMMENT" || echo "(none)"
}

if [[ "${1:-}" == "--list" ]]; then
  list_blocks
  exit 0
fi

IP="${1:-}"
ACTION="block"
if [[ "${2:-}" == "--unblock" ]]; then
  ACTION="unblock"
fi

if [[ -z "$IP" ]]; then
  usage
fi

if [[ ! "$IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
  echo "Refusing: '$IP' does not look like a bare IPv4 address (no CIDR/hostnames)." >&2
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "Must run as root (sudo) — modifying iptables." >&2
  exit 1
fi

# Docker inserts its own ACCEPT rules into DOCKER-USER at the top; ours must
# also be inserted at the top (-I) of DOCKER-USER to actually take effect for
# traffic destined to published container ports (5060/udp, 5060/tcp, 5061,
# 8080, 8443, 8880 — see docker-compose.yml kamailio.ports).
if ! iptables -L DOCKER-USER -n >/dev/null 2>&1; then
  echo "DOCKER-USER chain not found — is Docker's iptables integration enabled? Falling back to INPUT only." >&2
  HAVE_DOCKER_USER=0
else
  HAVE_DOCKER_USER=1
fi

if [[ "$ACTION" == "block" ]]; then
  if [[ "$HAVE_DOCKER_USER" == "1" ]]; then
    if ! iptables -C DOCKER-USER -s "$IP" -j DROP -m comment --comment "$MARKER_COMMENT" 2>/dev/null; then
      iptables -I DOCKER-USER 1 -s "$IP" -j DROP -m comment --comment "$MARKER_COMMENT"
      echo "Inserted DOCKER-USER DROP for $IP"
    else
      echo "DOCKER-USER DROP for $IP already present"
    fi
  fi
  if ! iptables -C INPUT -s "$IP" -j DROP -m comment --comment "$MARKER_COMMENT" 2>/dev/null; then
    iptables -I INPUT 1 -s "$IP" -j DROP -m comment --comment "$MARKER_COMMENT"
    echo "Inserted INPUT DROP for $IP"
  else
    echo "INPUT DROP for $IP already present"
  fi
else
  iptables -D DOCKER-USER -s "$IP" -j DROP -m comment --comment "$MARKER_COMMENT" 2>/dev/null && echo "Removed DOCKER-USER DROP for $IP" || echo "No DOCKER-USER DROP rule for $IP to remove"
  iptables -D INPUT -s "$IP" -j DROP -m comment --comment "$MARKER_COMMENT" 2>/dev/null && echo "Removed INPUT DROP for $IP" || echo "No INPUT DROP rule for $IP to remove"
fi

echo
echo "=== Current state ==="
list_blocks

echo
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save
  echo "Persisted via netfilter-persistent."
elif command -v iptables-save >/dev/null 2>&1 && [[ -d /etc/iptables ]]; then
  iptables-save > /etc/iptables/rules.v4
  echo "Persisted to /etc/iptables/rules.v4."
else
  echo "NOTE: not persisted across reboot — no netfilter-persistent / /etc/iptables found."
  echo "Install with: sudo apt-get install -y iptables-persistent"
  echo "Or re-run this script from a @reboot cron / systemd unit."
fi
