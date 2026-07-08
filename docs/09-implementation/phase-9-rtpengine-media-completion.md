# Phase 9 — RTPengine Media Integration (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P9-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 9 Complete (static validation PASS; Docker two-way audio pending real daemon) |
| **Date** | 2026-07-08 |
| **Scope** | Sprint 5 Wave 3 — RTPengine media anchoring (first media-enabled phase) |
| **Architecture** | TEL-RTP-001 / ADR-009 / ADR-019 — frozen |
| **Constraint** | Phases 1–8 / Prisma / architecture frozen; no recording / WebRTC client / queue / IVR / codec policy |

---

## 1. Media flow summary

### Call flow (all productive calls)

```text
INVITE (+ SDP)
  → Kamailio route[INVITE] → NestJS /routing/resolve → platformUuid
  → rtpengine_offer() — SDP rewritten, media anchored
  → RELAY (internal FORK or BRIDGE_CARRIER Telnyx)
200 OK (+ SDP)
  → onreply_route[MANAGE_REPLY] → rtpengine_answer()
  → Media established (RTP/SRTP/DTLS per leg flags)
BYE / failure / CANCEL
  → rtpengine_delete()
  → NestJS /media/lifecycle (delete) → Redis TTL cleanup
```

### Leg profiles (Phase 9)

| Leg type | Detection | RTPengine flags |
|----------|-----------|-----------------|
| **WebRTC-ready** | `$proto` ws/wss or SDP `a=fingerprint` | `ICE=force ICE=force-relay DTLS=passive` |
| **Internal SIP** | Default non-carrier | `ICE=remove SDES=on` |
| **PSTN / Telnyx** | `from_carrier` ACL group 2 | `ICE=remove RTP/AVP` |
| **All legs** | Always | `replace-origin replace-session-connection` + NAT `direction=both` when flagged |

Two-way audio in lab requires **real `rtpengine-daemon`** on the Docker host. The Phase 4 NG stub acknowledges offer/answer/delete for control-plane validation only.

---

## 2. RTPengine integration summary

| Component | Path / setting |
|-----------|----------------|
| Kamailio module | `rtpengine.so` — `udp:rtpengine:2223` |
| Offer | `route[RTPENGINE_OFFER]` → `rtpengine_offer()` before `t_relay()` |
| Answer | `onreply_route[MANAGE_REPLY]` on 183/200 + SDP → `rtpengine_answer()` |
| Delete | BYE, CANCEL, `failure_route[MANAGE_FAILURE]` → `rtpengine_delete()` |
| platformUuid label | `modparam extra_id_pv` + `via-branch=extra` |
| Runtime map | htable `rtpe_puuid`, `rtpe_carrier`, `rtpe_active` keyed by SIP Call-ID |
| Config | `infrastructure/rtpengine/rtpengine.conf` — ports 10000–10099, NG 2223 |
| Health | Compose HEALTHCHECK + NG ping; Kamailio `/ready` reports `"rtpengine":"configured"` |

**Not implemented (by design):** recording pipeline, conference mixing, queue MOH, IVR prompts, codec transcoding policy.

---

## 3. Media lifecycle

| Event | Kamailio action | NestJS / Redis |
|-------|-----------------|----------------|
| **offer** | `rtpengine_offer()` after route resolve + `call/start` | `POST /media/lifecycle` `{event:"offer"}` → `corr:rtp:{sipCallId}` + update `corr:platform:{uuid}` |
| **answer** | `rtpengine_answer()` on 183/200 SDP reply | `{event:"answer"}` — `mediaAnchored: true` |
| **delete** | `rtpengine_delete()` on BYE/failure/CANCEL | `{event:"delete"}` — del `corr:rtp`, `mediaAnchored: false` |

Media state (SDP, ICE, DTLS keys, RTPengine NG internals) **never** written to Prisma.

---

## 4. Correlation summary

| ID | Role | Store |
|----|------|-------|
| **platformUuid** | Sole business correlator (ADR-019) | Prisma `CallSession`, Redis `corr:platform`, Kamailio `X-VSP-Platform-UUID`, rtpengine `extra_id_pv` |
| **sipCallId** | SIP + RTPengine session key in Phase 9 | Redis `corr:rtp:{sipCallId}` only — **not** Prisma |
| **tenantId** | Resolved from CallSession read in `MediaLifecycleService` | Redis key prefix |

```text
NestJS resolve → platformUuid
Kamailio INVITE → htable rtpe_puuid[Call-ID] = platformUuid
rtpengine NG → via-branch=extra (platformUuid sticky label)
Kamailio → POST /media/lifecycle → Redis corr:rtp ↔ corr:platform
```

---

## 5. Validation report

| Check | Command | Result (this host) |
|-------|---------|-------------------|
| Phase 9 static gate | `npm run telecom:validate:phase9` | **PASS** |
| API build | `nx build api` (via phase9 gate) | **PASS** |
| Kamailio wiring | `npm run kamailio:validate` | **PASS** |
| RTPengine base | `npm run rtpengine:validate` | **PASS** |
| Prisma frozen | no schema diff | **PASS** |
| RTPengine receives offer | Kamailio cfg + stub logs `cmd=offer` | Static OK; runtime needs Docker |
| RTPengine receives answer | `MANAGE_REPLY` + stub logs `cmd=answer` | Static OK |
| RTPengine deletes sessions | BYE/failure paths + stub logs `cmd=delete` | Static OK |
| SRTP negotiation | `SDES=on` internal; WebRTC `DTLS=passive` | Flags wired |
| Internal SIP two-way audio | Softphone lab | Pending real daemon + Docker |
| PSTN two-way audio | Telnyx trunk lab | Pending real daemon + Docker |
| Kamailio media lifecycle logs | `xlog` offer/answer/delete + platformUuid | Wired |
| platformUuid only business ID | No sipCallId Prisma writes | **PASS** |

```bash
npm run telecom:validate:phase9
# Docker host with real rtpengine-daemon:
docker compose up -d rtpengine kamailio api
docker compose exec rtpengine rtpengine-ng-ping
# Place test INVITE with SDP; verify Kamailio logs and RTP port allocation
```

---

## 6. Phase 9 completion statement

Phase 9 delivers the **first media-enabled** slice of Sprint 5 Wave 3:

- Kamailio drives RTPengine **offer / answer / delete** on the productive INVITE path (internal FORK + PSTN BRIDGE_CARRIER).
- Media is **always anchored** through RTPengine with leg-appropriate SRTP, DTLS, and ICE flags.
- **platformUuid** remains the sole business correlation ID; telecom RTP session ids live in **Redis only**.
- Phases 1–8, Prisma schema, and architecture documents were **not modified** except validator gates updated to recognize Phase 9 media wiring.

**Stop boundary:** Phase 10 (recording pipeline, WebRTC browser client, etc.) is **not** started.

---

## Files touched (Phase 9 only)

| Area | Files |
|------|-------|
| Kamailio | `infrastructure/kamailio/kamailio.cfg` |
| RTPengine | `infrastructure/rtpengine/rtpengine.conf`, `infrastructure/docker/rtpengine/install-or-stub.sh` |
| NestJS | `media/media-lifecycle.service.ts`, DTOs, controller, service, module, `telecom-redis.service.ts` |
| Validation | `scripts/telecom/validate-phase9.cjs`, phase3/4/7/8 gate updates |
| Tooling | `package.json`, `Makefile`, `docs/09-implementation/README.md` |
