#!/usr/bin/env bash
# ADR-045 validation capture. Run on EC2 from /opt/vsp-phone-v4.
#
#   sudo bash rc1-evidence/adr045-capture.sh start    # BEFORE placing the call
#   ... place ONE Grandstream -> PSTN call, answer it, hold >= 10 min, hang up ...
#   sudo bash rc1-evidence/adr045-capture.sh stop
#   sudo bash rc1-evidence/adr045-capture.sh analyze
#
# Collects, for that single call:
#   A/B/C  every SIP message on the desk, internal and carrier legs (full snaplen)
#   D      RTP headers on both sides (96-byte snaplen so a 10 min hold stays small)
#   E/F/G  kamailio, asterisk (pjsip logger on) and rtpengine logs for the window
set -uo pipefail

BASE_DIR="${BASE_DIR:-/opt/vsp-phone-v4}"
RUN_ROOT="${RUN_ROOT:-${BASE_DIR}/rc1-evidence/adr045-runs}"
CURRENT="${RUN_ROOT}/current"

SIP_FILTER='udp port 5060 or udp port 5070 or udp port 5080'
RTP_FILTER='udp portrange 10000-10099 or udp portrange 20000-20999'

cmd="${1:-}"

start_capture() {
  command -v tcpdump >/dev/null || { echo "tcpdump missing: sudo apt-get install -y tcpdump"; exit 1; }

  STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  RUN="${RUN_ROOT}/${STAMP}"
  mkdir -p "$RUN"
  ln -sfn "$RUN" "$CURRENT"

  date -u +%s > "${RUN}/started_at_epoch"
  date -u > "${RUN}/started_at"

  # Full SIP, header-only RTP.
  tcpdump -i any -s0  -U -w "${RUN}/sip.pcap" "$SIP_FILTER" >"${RUN}/tcpdump-sip.err" 2>&1 &
  echo $! > "${RUN}/tcpdump-sip.pid"
  tcpdump -i any -s96 -U -w "${RUN}/rtp.pcap" "$RTP_FILTER" >"${RUN}/tcpdump-rtp.err" 2>&1 &
  echo $! > "${RUN}/tcpdump-rtp.pid"

  # Asterisk full SIP tracing for the window.
  docker exec vsp-asterisk asterisk -rx 'pjsip set logger on'  >/dev/null 2>&1
  docker exec vsp-asterisk asterisk -rx 'core set verbose 5'   >/dev/null 2>&1
  docker exec vsp-asterisk asterisk -rx 'core set debug 3'     >/dev/null 2>&1

  for c in vsp-kamailio vsp-asterisk vsp-rtpengine; do
    docker logs -f --since 1s "$c" > "${RUN}/${c}.log" 2>&1 &
    echo $! > "${RUN}/${c}.logpid"
  done

  sleep 2
  echo "capture running in ${RUN}"
  echo
  echo "PLACE THE CALL NOW:"
  echo "  1. Grandstream -> PSTN mobile"
  echo "  2. answer on the mobile"
  echo "  3. HOLD for at least 10 minutes (do not hang up at 32 s or at 60 s)"
  echo "  4. hang up from the desk phone"
  echo "  5. sudo bash rc1-evidence/adr045-capture.sh stop"
}

stop_capture() {
  RUN=$(readlink -f "$CURRENT" 2>/dev/null)
  [ -d "$RUN" ] || { echo "no active capture (missing ${CURRENT})"; exit 1; }

  date -u +%s > "${RUN}/stopped_at_epoch"
  date -u > "${RUN}/stopped_at"

  # Post-call state before anything ages out.
  docker exec vsp-asterisk asterisk -rx 'core show channels'        > "${RUN}/asterisk-channels.txt"  2>&1
  docker exec vsp-asterisk asterisk -rx 'pjsip show endpoints'      > "${RUN}/asterisk-endpoints.txt" 2>&1
  docker exec vsp-asterisk asterisk -rx 'pjsip show settings'       > "${RUN}/asterisk-settings.txt"  2>&1
  docker exec vsp-rtpengine sh -c 'rtpengine-ctl list sessions 2>/dev/null || true' > "${RUN}/rtpengine-sessions.txt" 2>&1
  cp /var/log/asterisk/cdr-csv/Master.csv "${RUN}/asterisk-cdr.csv" 2>/dev/null || \
    docker cp vsp-asterisk:/var/log/asterisk/cdr-csv/Master.csv "${RUN}/asterisk-cdr.csv" 2>/dev/null || true

  for p in "${RUN}"/*.pid "${RUN}"/*.logpid; do
    [ -f "$p" ] || continue
    kill "$(cat "$p")" 2>/dev/null || true
  done
  sleep 2
  for p in "${RUN}"/*.pid; do
    [ -f "$p" ] || continue
    kill -9 "$(cat "$p")" 2>/dev/null || true
  done

  docker exec vsp-asterisk asterisk -rx 'pjsip set logger off' >/dev/null 2>&1
  docker exec vsp-asterisk asterisk -rx 'core set debug 0'     >/dev/null 2>&1

  chmod -R a+r "$RUN" 2>/dev/null || true
  echo "capture stopped: ${RUN}"
  ls -la "$RUN"
  echo
  echo "now run: sudo bash rc1-evidence/adr045-capture.sh analyze"
}

case "$cmd" in
  start) start_capture ;;
  stop)  stop_capture ;;
  analyze)
    RUN=$(readlink -f "$CURRENT" 2>/dev/null)
    [ -d "$RUN" ] || { echo "no capture directory"; exit 1; }
    bash "${BASE_DIR}/rc1-evidence/adr045-analyze.sh" "$RUN"
    ;;
  *)
    echo "usage: $0 {start|stop|analyze}"
    exit 2
    ;;
esac
