# ADR-045 deploy and validation runbook

Architecture change: Kamailio becomes a plain RFC 3261 edge proxy; a new `vsp-asterisk`
container is the B2BUA that owns the Telnyx dialog. See
[ADR-045](../docs/ADR/ADR-045-asterisk-b2bua-carrier-core.md).

This agent has no SSH access to `ubuntu@32.196.41.160` (`Permission denied (publickey)`),
so the commands below must be run on the host. Every step prints evidence to paste back.
The three scripts in this directory do the work so nothing depends on typing a `tshark`
filter correctly under time pressure:

| Script | Purpose |
|---|---|
| `adr045-verify-deploy.sh` | Post-deploy gates D1–D11 (health, config, reachability, isolation) |
| `adr045-capture.sh` | `start` / `stop` / `analyze` — captures SIP, RTP and all three container logs for one call |
| `adr045-analyze.sh` | Turns the capture into the numbered pass/fail table for gates 1–24 |
| `adr045-egress-spoof-test.py` | Proves `X-VSP-Egress` is refused on the public socket |
| `adr045-static-check.js` | Repo-side assertions; already run before the commit |

## 0. What changed

| Component | Change |
|---|---|
| `infrastructure/asterisk/*` | New — PJSIP endpoints (`kamailio`, `telnyx`), dialplan, RTP, logging |
| `infrastructure/docker/Dockerfile.asterisk` | New — Ubuntu 24.04 LTS + Asterisk 20 LTS from universe (Debian dropped the package before bookworm released and never restored it) |
| `docker-compose.yml` / `.prod.yml` | New `asterisk` service on `vsp_internal`, no published ports |
| `infrastructure/kamailio/kamailio.cfg` | −890 lines of hand-rolled B2BUA / ACK / Contact / Route surgery; new internal socket, `record_route()`, `CARRIER_EGRESS` |
| `infrastructure/rtpengine/rtpengine.conf` | Second logical interface (`internal` / `external`) so the Asterisk side is not given the public IP |

New environment variables (all have safe defaults): `ASTERISK_SIP_PORT`,
`ASTERISK_RTP_PORT_MIN/MAX`, `ASTERISK_REQUIRE_TRUNK`, `KAMAILIO_INTERNAL_SIP_PORT`.
`TELNYX_SIP_USERNAME` / `TELNYX_SIP_PASSWORD` are now consumed by Asterisk instead of
Kamailio; they must already be present in `.env`.

**No AWS security-group change is required.** Asterisk publishes no host ports, and the
carrier leg still leaves the host from Kamailio on UDP 5060 with media from RTPengine on
10000–10099.

## 1. Deploy

```bash
ssh ubuntu@32.196.41.160
cd /opt/vsp-phone-v4

# Pin to the exact approved commit rather than whatever the branch tip is.
git fetch origin --prune
git checkout release/v4.0.0-rc1
git reset --hard <APPROVED_SHA>
git rev-parse HEAD            # must echo <APPROVED_SHA>
git status --short            # must be empty apart from .env

source scripts/platform/ec2-compose-env.sh   # sets $COMPOSE

# Trunk credentials must exist — Asterisk refuses to start without them in production.
grep -E '^(TELNYX_SIP_USERNAME|TELNYX_SIP_PASSWORD|SIP_PUBLIC_IP|RTPENGINE_ADVERTISE)=' .env | sed 's/=.*/=<set>/'

$COMPOSE config >/dev/null && echo "compose config OK"
$COMPOSE build asterisk kamailio rtpengine
$COMPOSE up -d asterisk rtpengine kamailio
$COMPOSE ps
```

## 2. Deploy gates — all must pass before dialling

```bash
sudo bash rc1-evidence/adr045-verify-deploy.sh
```

Covers: compose merge includes Asterisk · all three containers healthy · Kamailio bound on
5060 **and** 5070 with the container address advertised · Kamailio config lint OK · Asterisk
config rendered with no leftover placeholders · both PJSIP endpoints and the trunk auth
loaded · `vsp-outbound` dialplan present · RTPengine advertising a public address on the
`external` interface only · Kamailio→Asterisk and Asterisk→Kamailio OPTIONS answered ·
dispatcher carrier set loaded · Asterisk publishes no host ports and the host has no
udp/5080 listener · Kamailio 5070 not published · `X-VSP-Egress` refused on the public
socket.

A green board here means the stack is wired correctly. It does **not** mean the 32 s
teardown is fixed — only the call in section 3 can show that.

## 3. Capture, then place one call

```bash
sudo bash rc1-evidence/adr045-capture.sh start
```

Then, from the Grandstream:

1. dial the PSTN mobile
2. answer on the mobile
3. **hold for at least 10 minutes** — do not hang up at 32 s or at 60 s
4. hang up from the desk phone
5. `sudo bash rc1-evidence/adr045-capture.sh stop`

The capture writes to `rc1-evidence/adr045-runs/<STAMP>/`: `sip.pcap` (full snaplen, legs
A/B/C), `rtp.pcap` (96-byte snaplen, both media sides), `vsp-kamailio.log`,
`vsp-asterisk.log` with the PJSIP logger enabled, `vsp-rtpengine.log`, plus Asterisk
channel/endpoint state and the CDR.

## 4. Analyse

```bash
sudo bash rc1-evidence/adr045-capture.sh analyze
```

Prints and saves `summary.txt` with the numbered gates:

| Gates | What they prove |
|---|---|
| 1–3 | Asterisk received the call and created a **separate** carrier dialog with its own Call-ID |
| 4–5 | Asterisk owns the carrier From/To tags and CSeq space |
| 6–7 | Telnyx 18x and 200 OK reached Asterisk and propagated to the phone |
| 8 | **ACK latency in milliseconds** against the < 50 ms target |
| 9–10 | Exactly one ACK, no 200 OK retransmission |
| 11, 18 | No provider teardown, no ~32 s disconnect |
| 12–13, 17 | Phone got the 200 OK and the timer started with no ~10 s gap |
| 14–16 | RTP flowing on both port ranges |
| 19–20 | Record-Route headers on the INVITE that reached Asterisk |
| 21 | In-dialog BYE in both directions |
| 22 | Carrier signalling leaves from source port 5060, never 5070 |
| hold | `call_seconds` ≥ 600, clean BYE/200, no 422/408 session-timer failure |

Leg identification is structural, not IP-based: the desk leg is the INVITE to udp/5080, the
carrier leg is the INVITE to udp/5070. Because `tcpdump -i any` sees both the pre-NAT and
post-NAT copy of outbound packets, the analyser collapses same-branch frames less than
100 ms apart into one event; genuine retransmissions (≥ 500 ms, RFC 3261 T1) stay distinct.

Gate 23 (`X-VSP-Egress` refused on 5060) and gate 24 (Asterisk unreachable externally) come
from section 2. Gate H (Telnyx CDR) is manual: export the CDR for the carrier Call-ID that
the analyser prints and confirm the duration matches.

Copy the results into [RC1-A-PRIME-VALIDATION.md](./RC1-A-PRIME-VALIDATION.md).

## 5. If something fails

**Deployment.** The failing gate names the container; `docker logs <container> --tail=120`
and, for Kamailio, `$COMPOSE logs kamailio | grep -E 'ERROR|CRITICAL'`.

**The call.** The analyser is ordered by protocol sequence, so the **topmost `[FAIL]`** is
the first divergence. Compare it against the known-good Asterisk/Telnyx ladder in
[RC1-freepbx-reference-comparison.md](./RC1-freepbx-reference-comparison.md) before changing
anything, and do not reintroduce the retired Kamailio ACK / CSeq / Contact / Route surgery —
if the carrier ACK is late or missing, the fault is now in the Asterisk trunk configuration
or in the edge routing of a single message.

Two behaviours rely on standard Kamailio semantics rather than explicit script code, so
check them on the first capture:

1. **Double Record-Route.** The INVITE reaching Asterisk should carry two `Record-Route`
   headers: one with the public address (`32.196.41.160:5060`) and one with the Kamailio
   container address on port 5070.
2. **Send-socket selection on in-dialog requests.** A `BYE` from Asterisk toward Telnyx must
   leave the host with source port **5060**, not 5070. Kamailio derives this from the Route
   hop it record-routed; 5070 is not reachable from outside the host.

## 6. Rollback

Both routes are preserved.

```bash
# Full revert of the A-prime commit
cd /opt/vsp-phone-v4
git revert --no-edit <APPROVED_SHA>
source scripts/platform/ec2-compose-env.sh
$COMPOSE up -d --force-recreate kamailio rtpengine
$COMPOSE stop asterisk

# Or file-level, leaving the image built and the container merely stopped
git checkout <PREVIOUS_SHA> -- infrastructure/kamailio/kamailio.cfg \
  infrastructure/rtpengine/rtpengine.conf docker-compose.yml docker-compose.prod.yml
$COMPOSE up -d --force-recreate kamailio rtpengine
$COMPOSE stop asterisk
```
