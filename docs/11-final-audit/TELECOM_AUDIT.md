# Telecom Audit — VSP Phone v4

| Field | Value |
|-------|-------|
| **Document ID** | AUDIT-002 |
| **Date** | 2026-07-08 |
| **Scope** | SIP flows, routing, media, call apps, enterprise features |

---

## Telecom architecture rating: B (Good core paths; enterprise app SIP integration gap)

---

## Signalling plane

### Kamailio (`infrastructure/kamailio/kamailio.cfg`)

| Flow | Route | NestJS endpoint | Status |
|------|-------|-----------------|--------|
| REGISTER | `route[REGISTRAR]` | `POST /auth/sip-digest`, `/register`, `/unregister` | ✅ Operational |
| INVITE (internal/inbound) | `route[INVITE]` | `POST /routing/resolve` → FORK | ✅ Operational |
| INVITE (outbound PSTN) | `route[INVITE]` | `POST /routing/resolve` → BRIDGE_CARRIER | ✅ Operational |
| Call lifecycle | In-dialog BYE/CANCEL | `POST /call/start`, `/call/update`, `/call/end` | ✅ Operational |
| Media (RTPengine) | `RTPENGINE_OFFER/ANSWER/DELETE` | `POST /media/lifecycle` | ✅ Operational |
| In-dialog continue | — | `POST /routing/continue` | ❌ Not wired in Kamailio |
| REFER (transfer) | — | — | ❌ Not implemented |
| APP_MEDIA actions | — | Returned by API | ❌ Not handled in Kamailio |

### RTPengine (`infrastructure/rtpengine/rtpengine.conf`)

- NG port 2223, media ports 10000–10099
- Kamailio uses static `udp:rtpengine:2223` (single node)
- WebRTC/PSTN/internal SRTP flag selection in `RTPENGINE_SET_FLAGS`
- Recording deferred at media layer (`recording-method = proc` prepared, not active)

---

## Registration flow

```
UA → Kamailio (401 challenge) → UA (Authorization)
  → Kamailio → POST /auth/sip-digest → SipDigestAuthService.authenticate()
  → Prisma SIPEndpoint + SipCredentialVaultService.resolveHa1()
  → allow → save("location") → POST /register → RegistrationService
  → Redis contact bindings + SIPEndpoint.lastRegisteredAt + events
```

**Assessment:** Correct per ADR-007/ADR-043. Tenant isolation enforced in digest auth (`tenant_isolation_violation` deny path).

**Limitation:** Kamailio `usrloc` uses `db_mode=0` (memory-only). Registrations lost on Kamailio restart; Redis mirror in NestJS is durable source for routing.

---

## INVITE handling

### Internal extension-to-extension

1. Kamailio POST `/routing/resolve`
2. `RoutingService.resolveInternal()` → line lookup → device fork plan
3. Response: `FORK` with `forkContactsCsv`
4. Kamailio branches to registered contacts

**Assessment:** ✅ End-to-end path operational for line-to-line calls.

### Inbound PSTN (Telnyx)

1. Telnyx → Kamailio (dispatcher set 2, source address check)
2. `intentHint=INBOUND` + DNIS
3. `RoutingService.resolveInbound()` → DID lookup → line fork or call app overlay
4. FORK or BRIDGE_CARRIER response

**Assessment:** ✅ Inbound PSTN to extension path operational.

### Outbound PSTN

1. E.164 R-URI detection → `intentHint=OUTBOUND`
2. `RoutingService.resolveOutbound()` → carrier trunk selection
3. `BRIDGE_CARRIER` → Kamailio dispatcher set 2 → RTPengine offer → relay

**Assessment:** ✅ Outbound PSTN path operational.

---

## Enterprise call applications

### API runtime (Phase 13)

| Application | Service | Route action returned |
|-------------|---------|----------------------|
| Queue | `QueueRuntimeService` | `APP_MEDIA` |
| IVR | `IvrRuntimeService` | `APP_MEDIA` |
| Conference | `ConferenceRuntimeService` | `APP_MEDIA` |
| Voicemail | `VoicemailRuntimeService` | `APP_MEDIA` / `VOICEMAIL` |

Resolution path: `RoutingService` → `CallAppsRoutingService.resolveAppDestination()` → runtime session creation → route plan.

### Kamailio handling

Kamailio `route[INVITE]` branches only on:
- `BRIDGE_CARRIER`
- `REJECT`
- `forkContactsCsv` (FORK)

**No handler for `APP_MEDIA`, `VOICEMAIL`, or `SERIAL`.**

When routing returns `APP_MEDIA`, Kamailio falls through to `lookup("location")` which will not find a SIP UA at the media URI — calls will fail with 480/404.

### Mid-call continue (`routing/continue`)

API implements `RoutingContinueService.continue()` for:
- Queue agent connect / abandon
- IVR DTMF digit handling
- Park retrieve
- Supervisor monitor join

**Kamailio has zero HTTP calls to `/routing/continue`.** Mid-call application logic cannot be driven from the SIP plane without additional integration.

**Severity: HIGH** — Enterprise call apps (queue, IVR, conference) and enterprise ops features that depend on `APP_MEDIA` or `routing/continue` are **API-complete but SIP-plane incomplete**.

---

## Enterprise operations (Phase 14)

| Feature | API service | Kamailio integration |
|---------|-------------|---------------------|
| Park / Pickup | `ParkRuntimeService`, `PickupRuntimeService` | APP_MEDIA — not in Kamailio |
| Ring / Hunt groups | `RingGroupService`, `HuntGroupService` | FORK expansion in API — works if fork plan returned |
| Paging / Intercom | `PagingRuntimeService`, `IntercomRuntimeService` | APP_MEDIA — not in Kamailio |
| BLF | `BlfSubscriptionService`, `BlfNotifyService` | Subscribe/notify via API callbacks |
| Supervisor monitor | `SupervisorMonitorService` | APP_MEDIA + continue — not in Kamailio |
| Feature codes | `EnterpriseOpsResolverService` | Resolved in routing/resolve — APP_MEDIA paths fail |

Ring/hunt groups that expand to FORK contacts **will work**. Feature codes resolving to APP_MEDIA **will not**.

---

## Transfers

No SIP REFER handling in Kamailio. No transfer API endpoints. **Not implemented** — documented as out of scope for frozen phases.

---

## Recording (Phase 12)

| Layer | Status |
|-------|--------|
| API policy | `RecordingPolicyService.evaluateRouteRecording()` — evaluates on route |
| API lifecycle | `RecordingLifecycleService` — events on call answered/ended |
| Kamailio hook | Not invoked |
| RTPengine capture | Deferred in config |

Recording metadata and policy exist; **media-layer capture not anchored** in Kamailio/RTPengine path.

---

## Presence & BLF (Phase 12/14)

- Line presence: `PresenceService` + Redis
- BLF subscriptions: `BlfSubscriptionService` via telecom controller callbacks
- Browser presence: `BrowserPresenceService` (WebRTC)

**Assessment:** API-layer presence operational. BLF depends on subscription/notify callbacks from Kamailio (partial — Kamailio does not emit dedicated presence events in cfg reviewed).

---

## WebRTC (Phase 10)

- JWT login → WebRTC enroll → short-lived SIP credentials
- Kamailio WSS listeners (8080/8443), Path header for NAT
- RTPengine WebRTC flags in SDP rewrite
- Admin softphone: `apps/admin/src/lib/softphone/`

**Assessment:** ✅ Architecture sound per ADR-039. Operational in lab with JWT/WSS configured.

---

## Grandstream provisioning (Phase 11)

- Admin enrollment API (JWT + rate limit)
- Prov-edge separate bootstrap (`prov-edge.bootstrap.ts`, port 3444)
- MAC Basic auth on config download
- Template rendering + artifact store

**Assessment:** ✅ Dual-app edge pattern (ADR-042) correctly separates provisioning HTTPS from main API.

---

## Carrier integration (Phase 8)

- `CarrierService` + `TelnyxCarrierAdapter`
- Outbound trunk selection with tenant filter
- DID lookup with tenant scoping
- Webhook signature verification (`TELNYX_WEBHOOK_SECRET`)
- Kamailio dispatcher set 2 for Telnyx primary/backup

**Assessment:** ✅ Carrier abstraction aligned with ADR-010.

---

## Architectural conflicts

| Conflict | Impact |
|----------|--------|
| API returns APP_MEDIA; Kamailio ignores it | Queue/IVR/Conference/Park/Voicemail calls fail at SIP layer |
| routing/continue API exists; Kamailio never calls it | No mid-call DTMF/queue/IVR progression |
| RTPengine HA registry vs Kamailio static sock | Multi-node RTPengine not used by Kamailio |
| Recording policy in API; no media capture hook | Recording metadata without guaranteed media files |
| Phase 13 marked complete vs SIP integration gap | Documentation/implementation divergence |

**No conflict** between registration, internal FORK routing, PSTN BRIDGE_CARRIER, and RTPengine media for those paths.

---

## Telecom rating summary

| Area | Rating |
|------|--------|
| SIP registration & auth | A |
| Internal extension routing | A- |
| PSTN inbound/outbound | A- |
| RTPengine media | B+ |
| WebRTC | B+ |
| Provisioning | A- |
| Queue / IVR / Conference | C (API only) |
| Park / Paging / Intercom | C (API only) |
| Transfers | F (not implemented) |
| Recording (media) | D (policy only) |
| **Overall telecom** | **B** |

---

## Related documents

- `docs/04-telecom/kamailio-architecture.md`
- `docs/04-telecom/rtpengine-architecture.md`
- `docs/04-telecom/enterprise-sip-call-flows-runtime-architecture.md`
- [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)
- [RECOMMENDATIONS.md](./RECOMMENDATIONS.md)
