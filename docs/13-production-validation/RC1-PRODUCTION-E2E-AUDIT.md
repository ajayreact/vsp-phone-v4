# RC1 Production E2E Audit — 10-Phase Gated Validation

| Field | Value |
|-------|-------|
| **Version** | 4.0.0-rc1 |
| **Branch** | `release/v4.0.0-rc1` |
| **Server** | EC2 `/opt/vsp-phone-v4` |
| **Goal** | Verify each telephony stage in order before changing code |

**Principle:** Do not proceed to the next phase until the current phase passes. Pause feature development until this audit completes.

---

## Quick start (EC2)

```bash
cd /opt/vsp-phone-v4
git fetch origin release/v4.0.0-rc1 && git checkout release/v4.0.0-rc1 && git pull
# Expect HEAD ≥ 56e80ff (carrier ACK From/Route fixes)

export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"

# Automated phases 1–6 (no live calls)
bash rc1-evidence/e2e-production-audit.sh --through 6

# Full audit including outbound hold test (≥15 min)
MANUAL_CALL_TEST=1 SEC=900 bash rc1-evidence/e2e-production-audit.sh
```

Report and artifacts: `/tmp/rc1-e2e-audit-<timestamp>/AUDIT-REPORT.md`

---

## Phase map

| Phase | Scope | Automated | Gate criteria |
|-------|-------|-----------|---------------|
| **1** | Infrastructure | ✅ | All core containers Up/healthy; network; disk; SIP/RTP ports; public IP |
| **2** | Kamailio | ✅ | HTTP health; config lint; `kamcmd` dispatcher/ul/dlg/tm; ACK routes present |
| **3** | RTPengine | ✅ | Process up; `rtpengine-ctl list` or pgrep; no crash loop |
| **4** | Telnyx | ✅ | Env vars; API health; `telnyx-config-audit.sh`; dispatcher telnyx |
| **5** | Database | ✅ | `rc1-infrastructure-validate.cjs`; tenants/DIDs/extensions; unmapped DIDs |
| **6** | Registration | ✅ | `ul.dump` contacts; no 401 loops; ext 100 registered |
| **7** | Inbound | ⚠️ Manual | PSTN→DID→ext→phone; no 404; 200+ACK+RTP |
| **8** | Outbound | ⚠️ Manual | `validate-32s-fix.sh`; hold ≥600s; no T+32s BYE |
| **9** | Media | ⚠️ Manual | `investigate-32s-call.sh`; bidirectional RTP |
| **10** | Failures | 📋 Checklist | Busy/decline/timeout/unregistered/invalid DID/restart |

---

## Phase 1 — Infrastructure

### Verify

- Docker containers, restart policies, health checks
- CPU/RAM, disk space
- Docker network, firewall, AWS Security Groups
- UDP 5060, RTP range, TLS ports, DNS, public IP

### Commands

```bash
docker ps -a
docker network ls
docker network inspect <network>
$COMPOSE ps
ss -lunp
sudo iptables -L -n
sudo ufw status
free -h
df -h
curl -4 ifconfig.me
```

### Existing tooling

- `scripts/platform/final-prod-validation.sh` — deploy + compose + API health
- `scripts/platform/rc1-infrastructure-validate.cjs` — DB integrity (also Phase 5)

---

## Phase 2 — Kamailio

### Verify

Dispatcher, routing blocks, NAT, Record-Route, Path, loose route, REGISTER/INVITE/ACK/BYE/CANCEL, dialog, tm, htable, permissions, auth.

### Commands

```bash
$COMPOSE exec kamailio kamcmd core.version
$COMPOSE exec kamailio kamcmd dispatcher.list
$COMPOSE exec kamailio kamcmd ul.dump
$COMPOSE exec kamailio kamcmd dlg.list
$COMPOSE exec kamailio kamcmd tm.stats
$COMPOSE exec kamailio kamailio -c -f /tmp/kamailio.runtime.cfg
curl -s http://127.0.0.1:8880/health
```

### RC1 priority routes (must exist in runtime cfg)

- `DESK_NORMALIZE_CARRIER_REPLY` — desk 200 OK Contact
- `CARRIER_STORE_RECORD_ROUTE` / `CARRIER_APPLY_ACK_ROUTE` — Route-first ACK
- `CARRIER_RELAY_ACK` — carrier From/To/CSeq on desk ACK relay

### Evidence scripts

- `rc1-evidence/compare-ack-wire.sh` — ACK vs 200 field diff
- `rc1-evidence/extract-sip-ladder.py` — full SIP ladder from pcap

---

## Phase 3 — RTPengine

### Verify

RTP ports, codec negotiation, media direction, RTP timeout.

### Commands

```bash
$COMPOSE exec rtpengine rtpengine-ctl list
ss -ulnp | grep -E '2223|10000'
$COMPOSE logs rtpengine --tail 100
curl -s http://127.0.0.1:3000/api/health/rtpengine
```

### Known RC1 issue

Desk leg **0 RTP packets** while carrier leg active — check NAT, SDP rewrite, phone firewall (see Phase 9).

---

## Phase 4 — Telnyx

### Verify

SIP connection, inbound/outbound, auth, ACL, DID assignment, INVITE routing, caller ID.

### Commands

```bash
bash rc1-evidence/telnyx-config-audit.sh
curl -s http://127.0.0.1:3000/api/health/telnyx
grep telnyx infrastructure/kamailio/dispatcher.list
bash rc1-evidence/telnyx-cdr-fetch.sh
```

---

## Phase 5 — Database

### Verify

Tenant, DID, extension, user, device, SIP credentials, trunk, caller ID, routing tables.

### Commands

```bash
node scripts/platform/rc1-infrastructure-validate.cjs
$COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -c "SELECT number, line_id, tenant_id FROM phone_numbers WHERE deleted_at IS NULL;"
$COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -c "SELECT tenant_id, extension FROM extensions WHERE deleted_at IS NULL;"
```

### Historical failure

**Inbound 404** — DID not mapped to extension. Check `phase5-unmapped-dids.txt` from audit output.

---

## Phase 6 — Registration

### Verify

Every phone: REGISTER → 401 → digest → **200 OK**. No 401 loops, stale nonce, expired contacts, duplicate registrations.

### Commands

```bash
$COMPOSE exec kamailio kamcmd ul.dump
node scripts/platform/parse-usrloc-dump.cjs /tmp/ul-dump.txt
$COMPOSE logs kamailio --since 30m | grep REGISTER
```

---

## Phase 7 — Inbound calls

### Path

```
Carrier → Kamailio → Tenant → Extension → Phone → 200 OK → ACK → RTP → BYE
```

### Test

1. Call assigned DID from mobile/PSTN
2. Phone rings, answer, talk 30s, hang up
3. Capture: `SEC=120 bash rc1-evidence/capture-teardown.sh`

### Fail indicators

- **404 Not Found** — routing/DID mapping (Phase 5)
- No ring — registration or dispatcher
- One-way audio — Phase 9

---

## Phase 8 — Outbound calls

### Path

```
Phone → Kamailio → Auth → Caller ID → Telnyx → PSTN → Answer → Media → Hangup
```

### Test (Grandstream ext 100 → PSTN)

```bash
# Deploy must be ≥ 56e80ff
SEC=900 bash rc1-evidence/validate-32s-fix.sh
bash rc1-evidence/compare-ack-wire.sh "$PCAP" "$CALLID"
```

### Pass criteria

- CDR `call_sec >= 600` (or hold ≥10 min)
- No Telnyx BYE at **T+32.000s** from first carrier 200 OK
- Logs: `carrier ACK route applied count=2 wire0=... wire1=...`
- Clean desk From (no duplicate display name)

### Historical failures (fixed in recent commits)

| Issue | Commit |
|-------|--------|
| Desk Contact `sip:0@0` → zero ACK | `08799d0` |
| Wrong carrier ACK CSeq | `9caf24c` |
| Wrong carrier From/To on ACK | `a5eb6a2` |
| Duplicate desk From | `56e80ff` |

---

## Phase 9 — Media

### Verify

- No one-way audio / no audio
- Codec match (G.711 typical for Grandstream)
- DTMF, hold, resume (manual)
- RTP packet counts both legs

### Commands

```bash
bash rc1-evidence/investigate-32s-call.sh "<Call-ID>"
sudo tcpdump -i any -n udp portrange 10000-10099 -c 100
python3 rc1-evidence/extract-sip-ladder.py "$PCAP"
```

### Asterisk reference baseline

```bash
bash rc1-evidence/asterisk-telnyx-baseline.sh
bash rc1-evidence/pbx-interop-test.sh
python3 rc1-evidence/compare-pbx-ladders.py
```

---

## Phase 10 — Failure scenarios

Manual checklist (see audit output `phase10-failure-checklist.md`):

- Busy, decline, timeout, unregistered extension
- Invalid DID, invalid extension
- Carrier failure, container restart mid-call

---

## Recommended execution order

Based on RC1 investigation history:

1. **Phase 1–5** — run now, fix any FAIL before calls
2. **Phase 6** — confirm Grandstream ext 100 registered (`122.177.246.92`)
3. **Phase 8** — outbound hold test on **`56e80ff`** (current focus: T+32s BYE)
4. **Phase 9** — RTP desk leg (0 pkts observed on last call)
5. **Phase 7** — inbound after outbound stable
6. **Phase 10** — edge cases last

---

## Related docs and scripts

| Resource | Purpose |
|----------|---------|
| [01-telecom-smoke-tests.md](./01-telecom-smoke-tests.md) | Per-service smoke commands |
| [02-call-flow-validation.md](./02-call-flow-validation.md) | SIP method checklist |
| `scripts/platform/rc1-validate-all.cjs` | API/platform phases 1–6 |
| `rc1-evidence/e2e-production-audit.sh` | **This audit orchestrator** |
| `rc1-evidence/RC1-protocol-investigation.md` | 408 ACK timeout wire proof |
| `rc1-evidence/RC1-grandstream-zero-ack-endpoint-proof.md` | Zero-ACK proof |

---

## When to resume code changes

Resume Kamailio/feature work only when:

1. Phases 1–6 all **PASS**
2. Phase 8 **PASS** — ≥10 min hold, no T+32s teardown
3. Phase 9 **PASS** — bidirectional RTP
4. Wire capture shows ACK matches Asterisk reference (`compare-ack-wire.sh` clean)

Until then, treat new symptoms as **audit failures** in the relevant phase, not one-off fixes.
