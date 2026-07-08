# Phase 10 — WebRTC Browser Client Integration (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P10-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 10 Complete (static validation PASS; Docker WSS/audio e2e pending) |
| **Date** | 2026-07-08 |
| **Scope** | Sprint 5 Wave 4 — Browser softphone via SIP.js + WSS |
| **Architecture** | TEL-WRTC-001 / ADR-038 / ADR-039 / ADR-012 — frozen |
| **Constraint** | Phases 1–9 / Prisma / architecture frozen |

---

## 1. Browser architecture summary

```text
Browser UI (Next.js /softphone)
  │ HTTPS JWT
  ▼
NestJS POST /v1/auth/login
  │ Bearer JWT
  ▼
NestJS POST /v1/telecom/webrtc/enroll → sipUsername, sipPassword, wssUrl, iceServers
  │ SIP.js UserAgent
  ▼
Kamailio WSS (RFC 7118) — REGISTER / INVITE / BYE
  │ rtpengine_offer/answer/delete (Phase 9)
  ▼
RTPengine — ICE force-relay + DTLS-SRTP ↔ desk/PSTN peers
```

| Plane | Owner | Phase 10 |
|-------|-------|----------|
| App auth | NestJS JWT | `AuthModule` |
| SIP creds | NestJS enroll + vault | Short-lived digest secret |
| Signaling | Kamailio WSS | Path on REGISTER (ADR-039) |
| Media | Browser WebRTC + RTPengine | No SDP in Prisma |
| Business ID | `platformUuid` only | Unchanged from Phase 7–9 |

**Not implemented:** conference, queue, IVR, recording UI, AI features.

---

## 2. SIP.js integration summary

| Component | Path |
|-----------|------|
| Dependency | `sip.js@0.21.2` (root `package.json`) |
| UA wrapper | `apps/admin/src/lib/softphone/sip-softphone.ts` |
| UI | `apps/admin/src/components/softphone/SoftphonePanel.tsx` |
| Route | `http://localhost:3001/softphone` |

**SIP.js capabilities wired:**
- `UserAgent` + WSS transport to enroll `wssUrl`
- `Registerer` — digest auth with enroll credentials
- `Inviter` / `Invitation` — outbound INVITE, inbound answer/reject
- `Session.bye()` / `cancel()` — hangup
- `holdModifier` + local unhold SDP modifier — hold/resume
- Track mute via `RTCRtpSender.track.enabled`
- `replaceTrack` — microphone switching
- `HTMLAudioElement.setSinkId` — speaker switching
- Transport disconnect → re-enroll + re-REGISTER
- Enroll expiry timer → proactive credential refresh

Multiple browser tabs: each tab runs an independent SIP.js UA instance (separate WebSocket + Contact).

---

## 3. Registration summary

### JWT login (app plane)
- `POST /api/v1/auth/login` — `{ email, password }` → Bearer JWT
- Lab: `DEV_AUTH_*` env vars when Prisma User unavailable
- Production path: Prisma `User.passwordHash` (scrypt format)

### WebRTC enroll (SIP plane)
- `POST /api/v1/telecom/webrtc/enroll` (JWT) → temporary SIP digest password
- `POST /api/v1/telecom/webrtc/enroll/revoke` (JWT) → vault + Redis cleanup
- TTL: `WEBRTC_ENROLL_TTL_SEC` (default 900s)
- Resolves `DeviceType.WEBRTC` + linked `SIPEndpoint` for authenticated user

### Kamailio WSS REGISTER (Phase 10 / ADR-039)
- `add_path()` before `save("location")` on `ws`/`wss` proto
- Strips untrusted `X-VSP-Platform-UUID` from browser signaling
- Digest verify via existing Phase 6 `/auth/sip-digest` (enroll creds in vault)

### Browser presence
- `POST /api/v1/telecom/webrtc/presence` (JWT) → Line `Presence` + Redis mirror

---

## 4. Media summary

| Topic | Implementation |
|-------|----------------|
| ICE | Enroll returns `iceServers[]` (STUN default; optional TURN env) |
| DTLS-SRTP | Browser `RTCPeerConnection` + Kamailio WebRTC rtpengine flags (Phase 9) |
| Anchoring | RTPengine always-on — no browser P2P in production path |
| Device access | `getUserMedia` + enumerateDevices for mic/speaker lists |
| Hold | SIP re-INVITE with hold/unhold SDP modifiers |
| Mute | Local audio track enable/disable |
| State storage | **None** in Prisma — SDP/ICE/DTLS stay in browser + RTPengine |

Env keys: `WEBRTC_WSS_URL`, `WEBRTC_STUN_URL`, `WEBRTC_TURN_*`.

---

## 5. Validation report

| Check | Command | Result |
|-------|---------|--------|
| Phase 10 gate | `npm run telecom:validate:phase10` | **PASS** |
| API build | via phase10 gate | **PASS** |
| Admin build | via phase10 gate | **PASS** |
| Phase 9 regression | via phase10 gate | **PASS** |
| Prisma frozen | no schema diff | **PASS** |
| Browser registers | SIP.js + Kamailio Path | Static OK; runtime needs Docker WSS |
| ICE / DTLS / two-way audio | RTPengine daemon + certs | Pending Docker lab |
| WSS stable / reconnect | Client reconnect + enroll refresh | Wired in client |
| Internal / PSTN calls | Uses Phase 7–9 routing + media | Pending e2e |

```bash
npm run telecom:validate:phase10
# Docker lab:
docker compose up -d kamailio rtpengine api
npm run dev:admin
# Open http://localhost:3001/softphone
# Login → Register via WSS → dial extension or E.164
```

**Prerequisites for live calls:** seeded `WEBRTC` Device + `SIPEndpoint` linked to user Line; trusted WSS cert or lab `wss://localhost:8443`.

---

## 6. Phase 10 completion statement

Phase 10 delivers the **approved browser softphone** on top of frozen Phases 1–9:

- Dual-plane auth: JWT app login + short-lived SIP enroll credentials (ADR-038)
- SIP.js over WSS to Kamailio with Path/Outbound readiness (ADR-039)
- Full call control: REGISTER, INVITE, BYE, hold, mute, device switching, reconnect
- Media flows through Phase 9 RTPengine anchoring with WebRTC ICE/DTLS flags
- `platformUuid` remains the sole business correlator; no SDP/ICE in Prisma

**Stop boundary:** Phase 11+ (recording UI, conference, queue, IVR) not started.

---

## Files touched (Phase 10 only)

| Area | Files |
|------|-------|
| Auth | `apps/api/src/modules/auth/*` |
| WebRTC API | `apps/api/src/modules/telecom/webrtc/*`, vault/redis extensions |
| Browser | `apps/admin/src/lib/softphone/*`, `components/softphone/*`, `app/softphone/*` |
| Kamailio | `infrastructure/kamailio/kamailio.cfg` (Phase 10 WSS Path only) |
| Config | `.env.example`, `env.validation.ts`, `package.json` |
| Validation | `scripts/telecom/validate-phase10.cjs`, `Makefile` |
