# 02 — SIP Call Flow & End-to-End Scenarios

| Field | Value |
|-------|-------|
| **Version** | 4.0.0-rc1 |
| **Role** | Production acceptance — manual + SIP tooling |

Tools: **sngrep**, **ngrep**, **tcpdump**, **SIPp**, **openssl**, Grandstream phone, browser softphone.

```bash
export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"
export API="https://127.0.0.1:3000/api"
```

---

## Part A — SIP Method Acceptance Checklist

| Method | Test | Steps | Expected | RC1 status |
|--------|------|-------|----------|------------|
| **REGISTER** | Desk phone / softphone | Configure extension → REGISTER to `SIP_PLATFORM_DOMAIN` | 401 challenge → digest → **200 OK**; contact in usrloc | ✅ Required for go-live |
| **OPTIONS** | Health | `sngrep` or SIPp OPTIONS to `:5060` | **200 OK** | ✅ |
| **SUBSCRIBE** | BLF/presence | Phone subscribes to dialog/presence URI | **200/202** + NOTIFY | ⚠️ Partial — API exists; lamp e2e manual |
| **NOTIFY** | Presence push | Change presence via API or phone | NOTIFY to subscriber | ⚠️ Partial |
| **INVITE** | Basic call | A calls B | **100/180/200**, SDP offer/answer | ✅ (with media caveat) |
| **ACK** | Post-answer | After 200 OK | ACK completes 3-way | ✅ |
| **BYE** | Hangup | Either party hangs up | **200 OK**, dialog cleared | ✅ |
| **CANCEL** | Early cancel | Cancel before answer | **487** / CANCEL handled | ✅ Kamailio route present |
| **REFER** | Transfer | REFER during call | Transfer completes | ❌ **Not implemented** (TL-01) |
| **INFO** | Mid-call | DTMF or routing continue | INFO → `/routing/continue` | ✅ H-02 resolved |
| **DTMF** | RFC2833 / SIP INFO | Press digits on IVR/queue | Digits reach media app | ⚠️ Requires real IVR media URI |
| **Session Timers** | Re-INVITE refresh | Long call (>30 min) | Session maintained | Manual verify |
| **Re-INVITE** | Hold/resume codec | Hold button | SDP renegotiation | Manual verify |
| **Hold** | Music on hold | Hold | Media changes / MOH URI | ⚠️ Requires media target |
| **Resume** | Off hold | Resume | Media restored | ⚠️ |
| **Codec negotiation** | G.711/G.722/Opus | INVITE SDP | Common codec in 200 OK | Manual — rtpengine stub limits media |
| **SRTP** | Encrypted RTP | SRTP-enabled endpoints | SDES/DTLS-SRTP in SDP | Manual |
| **RTP** | Media path | Answer call, `tcpdump udp portrange 10000-10099` | RTP packets | ⚠️ **Stub** until rtpengine-daemon |
| **ICE** | WebRTC | Browser call | ICE candidates in SDP | Manual WebRTC |
| **DTLS** | WebRTC SRTP | Browser WSS call | DTLS fingerprint in SDP | Manual WebRTC |

### Capture commands

```bash
# SIP signaling (all interfaces)
sudo sngrep -d any port 5060 or port 5061

# Filter Kamailio container
sudo ngrep -d any -W byline port 5060

# RTP (media range)
sudo tcpdump -i any -n udp portrange 10000-10099 -c 50

# TLS SIP
sudo tcpdump -i any -n host 127.0.0.1 and port 5061 -A

# Kamailio + API correlation
$COMPOSE logs -f kamailio api | grep -E 'REGISTER|INVITE|NESTJS|routing'
```

---

## Part B — End-to-End Call Scenarios

For each scenario record: **Call-ID**, **timestamps**, **SIP ladder**, **API logs**, **pass/fail**.

### Scenario 1 — Extension → Extension

| Step | Action |
|------|--------|
| 1 | Register extension A and B |
| 2 | A dials B (internal extension) |
| 3 | B answers, talk 30s, hang up |
| **Expected** | INVITE → NestJS `/routing/resolve` → FORK → 200 → RTP attempt |
| **RC1** | ✅ Signaling path ready; media depends on rtpengine-daemon |

### Scenario 2 — Grandstream → Grandstream

| Step | Action |
|------|--------|
| 1 | Provision both phones via `/gs/:mac/cfg.xml` |
| 2 | REGISTER both |
| 3 | Call A → B |
| **Expected** | Same as Scenario 1 with physical phones |
| **RC1** | ✅ Provisioning + REGISTER path |

### Scenario 3 — Browser → Browser

| Step | Action |
|------|--------|
| 1 | `/v1/telecom/webrtc/enroll` for A and B |
| 2 | Register via admin softphone (`:3001/softphone`) over WSS |
| 3 | A calls B |
| **Expected** | WSS REGISTER + INVITE + ICE |
| **RC1** | ✅ Enroll + WSS; full media manual |

### Scenario 4 — Browser → Grandstream

Cross-transport: WSS caller to UDP/TLS desk phone. Verify Path header on WSS REGISTER (Phase 10).

### Scenario 5 — Grandstream → Browser

Reverse of Scenario 4.

### Scenario 6 — Inbound PSTN (Telnyx)

| Step | Action |
|------|--------|
| 1 | Call published DID from mobile |
| 2 | Observe Kamailio → `/routing/resolve` |
| **Expected** | Ring destination extension/queue |
| **Requires** | Live Telnyx trunk + DID + `permissions.address` |

### Scenario 7 — Outbound PSTN

Extension dials E.164 → Kamailio `BRIDGE_CARRIER` → dispatcher set 2 (Telnyx).

### Scenario 8 — Transfer

| **Status** | ❌ **Blocked RC1** — SIP REFER not implemented (TL-01) |
| **Workaround** | Manual forward / new call |

### Scenario 9 — Conference

Route to `CONFERENCE_MEDIA_URI` → APP_MEDIA_RELAY. Requires real conference bridge SIP URI.

### Scenario 10 — Queue

Route to `QUEUE_MEDIA_URI` → agent FORK. Requires real queue media server + agent registration.

### Scenario 11 — IVR

Route to `IVR_MEDIA_URI` → DTMF via INFO/continue. Requires real IVR media server.

### Scenario 12 — Park

Feature code → park slot in Redis → APP_MEDIA. Manual park/pickup test.

### Scenario 13 — Pickup

Directed pickup from another extension. Redis + routing API.

### Scenario 14 — Paging

Multicast/page URI if configured. Manual if supported by tenant config.

### Scenario 15 — Voicemail

Route to `VOICEMAIL_MEDIA_URI`. APP_MEDIA relay; mailbox media server required.

---

## Part C — Acceptance matrix (summary)

| Scenario | Signaling | Media | RC1 go-live |
|----------|-----------|-------|-------------|
| 1–5 Internal | ✅ | ⚠️ | Pilot OK with media plan |
| 6–7 PSTN | ✅ | ⚠️ | Requires Telnyx prod |
| 8 Transfer | ❌ | — | Defer |
| 9–11 Apps | ✅ APP_MEDIA | ⚠️ URI | Configure real media |
| 12–15 Features | ✅ API | ⚠️ | Manual acceptance |

---

## Part D — Failure triage

| Symptom | Check |
|---------|-------|
| 401 loop on REGISTER | `auth/sip-digest`, `TELECOM_SERVICE_AUTH_TOKEN`, Kamailio logs |
| 404/usrloc miss | `SELECT * FROM location;`, postgres usrloc |
| No ring on INVITE | `/routing/resolve` response, Kamailio `route[INVITE]` logs |
| No audio | rtpengine daemon vs stub, UDP 10000–10099 firewall |
| Mid-call stuck | `/routing/continue`, INFO route |

See [TROUBLESHOOTING.md](../10-production/TROUBLESHOOTING.md).
