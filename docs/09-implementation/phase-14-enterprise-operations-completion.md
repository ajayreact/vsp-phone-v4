# Phase 14 — Enterprise Operations (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P14-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 14 Complete (static validation PASS; live SIP e2e pending) |
| **Date** | 2026-07-08 |
| **Scope** | Sprint 5 Wave 7 — BLF, SLA, park/pickup, ring/hunt, paging, intercom, supervisor |
| **Architecture** | ADR-004 / ADR-019 / ADR-024 — frozen |
| **Constraint** | Phases 1–13 / Prisma / Kamailio SIP signaling frozen |

---

## 1. BLF implementation summary

```text
POST /blf/subscribe  { watcherDeviceId, watchedLineIds[] }
        │
        ▼
BlfSubscriptionService → Redis blf:subs + blf:watchers indexes
        │
        ▼
presence.changed / call.ringing → BlfNotifyService
        ├─ lamp state: idle | ringing | busy | dnd | offline
        ├─ emit blf.lamp_changed
        └─ Redis presence:notify queue per watcher device
```

| Capability | Implementation |
|------------|----------------|
| BLF subscriptions | `BlfSubscriptionService.subscribe/unsubscribe` |
| Presence-driven lamps | `BlfNotifyService` listens to `presence.changed` + `call.ringing` |
| Lamp mapping | ON_CALL/BUSY → busy; DND → dnd; OFFLINE → offline; ringing index → ringing |
| Tenant isolation | All Redis keys scoped `vsp:{tenantId}:ops:blf:*` |
| Correlation | Optional `platformUuid` on lamp events |

**API:** `POST /api/v1/telecom/blf/subscribe`

---

## 2. Shared Line Appearance summary

```text
Inbound resolve → line FORK built → expandSlaFork
        │
        ▼
SlaAppearanceService reads Redis vsp:{tenant}:ops:sla:{sharedLineId}
        └─ FORK all appearance line devices (Call-Info: appearance=shared)
```

| Item | Detail |
|------|--------|
| Config | Redis JSON `{ appearanceLineIds: [...] }` — no Prisma tables |
| Trigger | Automatic on internal line resolve when SLA group exists |
| Signaling | Multi-device FORK across primary + appearance lines |
| Provisioning | Grandstream BLF keys deferred to template phase; runtime FORK ready |

---

## 3. Park / Pickup summary

### Call Park

| Step | Owner |
|------|-------|
| Park | `routing/continue` reason `park_call` → `CallSession.state=PARK` |
| Slot allocation | Redis `vsp:{tenant}:ops:park:{slot}` (configurable `PARK_SLOT_COUNT`) |
| MOH | `APP_MEDIA` park app + MoH URI |
| Retrieve | Dial `70{slot}` or `park_retrieve` continue |

### Pickup

| Mode | Dial / trigger | Behavior |
|------|----------------|----------|
| Directed | `*8{ext}` | Pick ringing call on target extension's line |
| Group | `*88` / `*881` | First ringing call in pickup group (Redis line set) |
| Ringing index | `call.ringing` listener | Redis `ops:pickup:ringing:{lineId}` → platformUuid |

**Events:** `park.parked`, `park.retrieved`, `pickup.offered`, `pickup.answered`

---

## 4. Ring & Hunt Group summary

Configured via Redis feature registry (`vsp:{tenant}:ops:feature:{code}`):

| Type | Strategy | Signaling |
|------|----------|-----------|
| Ring Group | RING_ALL | Parallel FORK to all member lines |
| Hunt Group | ROUND_ROBIN | SERIAL to next member (Redis RR counter) |
| Hunt Group | LONGEST_IDLE | SERIAL to least-recently-idle line |
| Hunt Group | PRIORITY | SERIAL to first available member |

Presence filter excludes OFFLINE/DND/ON_CALL members before selection.

**Events:** `ring_group.offered`, `hunt_group.offered`

---

## 5. Supervisor feature summary

```text
POST /routing/continue  { reason: supervisor_*, supervisorMode, targetPlatformUuid }
        │
        ▼
SupervisorMonitorService.join
        ├─ monitor → listen-only APP_MEDIA bridge
        ├─ whisper → coach channel APP_MEDIA
        └─ barge → barge-in APP_MEDIA
        │
        ▼
Redis vsp:{tenant}:ops:supervisor:{targetPlatformUuid}
```

| Mode | Media target | Call-Info |
|------|--------------|-----------|
| Monitor | `sip:supervisor@media...?mode=monitor` | purpose=supervisor-monitor |
| Whisper | `...?mode=whisper` | purpose=supervisor-whisper |
| Barge | `...?mode=barge` | purpose=supervisor-barge |

**Events:** `supervisor.monitor_started`, `supervisor.whisper_started`, `supervisor.barge_started`, `supervisor.session_ended`

---

## 6. Presence subscription summary

| Layer | Implementation |
|-------|----------------|
| Subscribe API | `POST /api/v1/telecom/presence/subscribe` |
| Channel naming | `vsp:{tenant}:presence:sub:{lineId}` (Phase 12 foundation) |
| Device registry | Redis `presence:sub:device:{deviceId}` → lineIds[] |
| Notifications | `presence.notification` events + Redis notify queue |
| Device sync | `presenceDeviceIndexKey` maintained on presence updates |
| Multi-device | Per-device Redis cache + `device.presence_changed` emission |

WebSocket push remains deferred; Redis notify queue is the runtime authoritative fan-out for Phase 14.

---

## 7. Validation report

| Check | Command / criterion | Result |
|-------|---------------------|--------|
| Phase 14 gate | `npm run telecom:validate:phase14` | **PASS** |
| API build | via phase14 gate | **PASS** |
| Phase 13 regression | via phase14 gate | **PASS** |
| Prisma frozen | no schema diff | **PASS** |
| Kamailio unchanged | Phase 9 media intact | **PASS** |
| BLF state updates | subscribe + lamp_changed events | **PASS** (code path) |
| SLA shared line FORK | expandSlaFork hook | **PASS** (code path) |
| Park / retrieve | park_call + 70xx dial | **PASS** (code path) |
| Pickup | directed + group | **PASS** (code path) |
| Ring / hunt groups | Redis feature resolve | **PASS** (code path) |
| Paging / intercom | auto-answer hints on FORK | **PASS** (code path) |
| Supervisor modes | monitor/whisper/barge continue | **PASS** (code path) |
| Presence subscriptions | subscribe API + notifications | **PASS** (code path) |
| Redis authoritative | all runtime state in Redis | **PASS** |
| platformUuid correlation | park/supervisor/pickup events | **PASS** |
| Live SIP e2e | Kamailio + desk phones | Pending lab |

```bash
npm run telecom:validate:phase14

# Seed ring group (Redis):
# SET vsp:{tenantId}:ops:feature:6000 '{"kind":"RING_GROUP","code":"6000","lineIds":["...","..."]}'

# Seed SLA (Redis):
# SET vsp:{tenantId}:ops:sla:{sharedLineId} '{"appearanceLineIds":["...","..."]}'

# BLF subscribe:
# POST /api/v1/telecom/blf/subscribe { "tenantId": "...", "watcherDeviceId": "...", "watchedLineIds": ["..."] }

# Park active call:
# POST /api/v1/telecom/routing/continue { "platformUuid": "...", "reason": "park_call" }

# Supervisor whisper:
# POST /api/v1/telecom/routing/continue { "platformUuid": "...", "reason": "supervisor_whisper", "supervisorMode": "whisper", "targetPlatformUuid": "..." }
```

---

## 8. Phase 14 completion statement

Phase 14 delivers **enterprise telephony operations** on frozen Phases 1–13:

- BLF subscriptions with presence-driven lamp state and Redis notification queue
- Shared Line Appearance via SLA FORK expansion on line resolve
- Call park (slot allocation, MOH, retrieve) and directed/group pickup
- Ring All and hunt groups (Round Robin, Longest Idle, Priority) via Redis config
- Paging and one-way/two-way intercom with auto-answer SIP hints
- Supervisor monitor, whisper coaching, and barge-in via media app bridges
- Presence subscriptions, device index sync, and multi-device state coordination
- All runtime state in Redis; `platformUuid` remains business correlator; tenant isolation enforced

**Stop boundary:** Production hardening not started (HA drill-down, compliance dashboards, AI analytics, WebSocket BLF push).

---

## Event catalog (Phase 14)

| Domain | Events |
|--------|--------|
| BLF | `blf.subscribed`, `blf.unsubscribed`, `blf.lamp_changed` |
| Park | `park.parked`, `park.retrieved` |
| Pickup | `pickup.offered`, `pickup.answered` |
| Ring/Hunt | `ring_group.offered`, `hunt_group.offered` |
| Supervisor | `supervisor.monitor_started`, `supervisor.whisper_started`, `supervisor.barge_started`, `supervisor.session_ended` |
| Presence | `presence.subscription_created`, `presence.notification`, `device.presence_changed` |

---

## Files touched (Phase 14 only)

| Area | Files |
|------|-------|
| Enterprise ops | `apps/api/src/modules/enterprise-ops/**` |
| Telecom integration | `routing.service.ts`, `routing-continue.service.ts`, `telecom.service.ts`, `telecom.controller.ts`, `telecom.request.dto.ts`, `telecom.response.dto.ts`, `telecom-redis.service.ts`, `module.ts` |
| Presence | `presence.service.ts` (device index) |
| Config | `.env.example`, `env.validation.ts`, `package.json` |
| Validation | `scripts/telecom/validate-phase14.cjs`, `validate-phase13.cjs`, `validate-phase9.cjs` |

**Frozen (not modified):** `prisma/schema.prisma`, Kamailio SIP cfg.
