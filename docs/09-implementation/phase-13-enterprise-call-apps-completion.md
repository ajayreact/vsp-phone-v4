# Phase 13 — Enterprise Call Applications (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P13-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 13 Complete (static validation PASS; media-app e2e pending) |
| **Date** | 2026-07-08 |
| **Scope** | Sprint 5 Wave 6 — Queue, IVR, Conference, MoH runtime |
| **Architecture** | ADR-004 / ADR-024 — frozen |
| **Constraint** | Phases 1–12 / Prisma / Kamailio SIP signaling frozen |

---

## 1. Queue runtime summary

```text
Dial code / DNIS overlay → POST /routing/resolve
        │
        ▼
CallAppsRoutingService → QueueRuntimeService.createQueueSession
        ├─ Prisma CallSession (callType=QUEUE, queueId)
        ├─ Redis vsp:{tenant}:queue:session:{platformUuid}
        ├─ Redis queue depth counter
        └─ Route Plan: APP_MEDIA (MOH + announcements)
        │
        ▼ (Kamailio/media app callbacks)
POST /routing/continue  { reason: queue_* | agent_answered }
        │
        ▼
QueueRuntimeService.continue
        ├─ Agent selection (QueueMember + Presence + registration contacts)
        ├─ FORK / SERIAL to agent SIP contacts
        ├─ Timeout → retry or QUEUE_OVERFLOW_DEST
        └─ Overflow → queue:<id> | VOICEMAIL
```

| Capability | Implementation |
|------------|----------------|
| Enter queue | `buildEnterPlan` → `APP_MEDIA` with MOH + prompt URIs |
| Agent selection | `QueueAgentSelectionService` — RING_ALL / ROUND_ROBIN / LINEAR |
| Announcements | `PromptManagementService.announcementUris(['welcome','queue_position'])` |
| Timeout | `queue_timeout` continue → `QUEUE_WAIT_SEC` timer in Route Plan |
| Overflow | `queue_overflow` / env `QUEUE_OVERFLOW_DEST` (`voicemail` or `queue:<uuid>`) |
| Retry | `queue_retry` / `QUEUE_RETRY_MAX` before overflow |
| Queue → Line | Agent offer → FORK/SERIAL contacts |
| Queue → Queue | Overflow dest `queue:<targetQueueId>` re-enters |
| Events | `queue.entered`, `queue.agent_offered`, `queue.announcement`, `queue.timeout`, `queue.overflow` + domain `QueueJoined` |

**Correlation:** `platformUuid` on CallSession, Redis session keys, and all queue events.

---

## 2. IVR runtime summary

```text
Dial IVR code / DNIS → createIvrSession
        │
        ▼
Route Plan: APP_MEDIA (main prompt + ivrTimeoutSec)
        │
        ▼
POST /routing/continue  { reason: ivr_digit, digit: "1" }
        │
        ▼
IvrRuntimeService.handleDigit → IVRMenu lookup
        ├─ LINE → FORK to destination line
        ├─ QUEUE → update CallSession → buildEnterPlan
        ├─ CONFERENCE → ConferenceRuntimeService.join
        └─ VOICEMAIL → VoicemailRuntimeService.buildVoicemailPlan
```

| Capability | Implementation |
|------------|----------------|
| Prompt playback | `APP_MEDIA` target with `prompt=` URI from catalog |
| DTMF routing | `IVRMenu.digit` + `destinationType` FKs (existing Prisma) |
| Invalid digit | Replay `ivr_invalid` prompt |
| Timeout | `ivr_timeout` → voicemail fallback |
| Events | `ivr.started`, `ivr.digit`, `ivr.prompt_played`, `ivr.completed`, `ivr.timeout` |

**Correlation:** `platformUuid` + Redis `ivrSessionKey`.

---

## 3. Conference summary

```text
Dial conference code → createConferenceSession
        │
        ▼
ConferenceRuntimeService.join
        ├─ ConferenceParticipant (JOINED)
        ├─ Redis conference live key
        ├─ Recording hook (policy → startFromPolicy)
        └─ APP_MEDIA (conf code + join prompt)
        │
        ▼
POST /routing/continue  { reason: conference_leave | conference_moderate, action }
        │
        ▼
leave / moderate (mute | unmute | lock)
```

| Capability | Implementation |
|------------|----------------|
| Join | Participant row + `APP_MEDIA` bridge target |
| Leave | `conference_leave` → participant LEFT |
| Moderation | `conference_moderate` + `mute` / `unmute` / `lock` |
| Recording hooks | Policy evaluation + `RecordingLifecycleService.startFromPolicy` |
| Events | `conference.joined`, `conference.left`, `conference.muted`, `conference.unmuted`, `conference.locked`, `conference.recording_hook` |

**Not implemented (out of scope):** supervisor listen/barge, BLF, AI transcription.

---

## 4. Media integration summary

| Layer | Owner | Phase 13 role |
|-------|-------|---------------|
| RTP / SDP | RTPengine | Unchanged — anchors caller ↔ media app |
| Signaling | Kamailio | Unchanged — executes Route Plan actions |
| Business logic | NestJS runtime services | Builds `APP_MEDIA` / `VOICEMAIL` targets |
| MOH | `MusicOnHoldService` | `MOH_DEFAULT_URI` + per-queue env override |
| Prompts | `PromptManagementService` | Catalog URIs under `PROMPT_BASE_URI` |
| Media apps | External SIP URIs | `QUEUE_MEDIA_URI`, `IVR_MEDIA_URI`, `CONFERENCE_MEDIA_URI`, `VOICEMAIL_MEDIA_URI` |

Route Plan action types used:

| Action | Use |
|--------|-----|
| `APP_MEDIA` | Queue MOH, IVR prompts, conference bridge |
| `VOICEMAIL` | IVR/queue overflow voicemail |
| `FORK` / `SERIAL` | Queue agent connect, IVR → line |

Mid-call transitions use **ADR-024** `POST /api/v1/telecom/routing/continue` with `platformUuid` + `reason`.

---

## 5. Validation report

| Check | Command / criterion | Result |
|-------|---------------------|--------|
| Phase 13 gate | `npm run telecom:validate:phase13` | **PASS** |
| API build | via phase13 gate | **PASS** |
| Phase 12 regression | via phase13 gate | **PASS** |
| Prisma frozen | no schema diff | **PASS** |
| Kamailio unchanged | Phase 9 media intact | **PASS** |
| Queue routing | resolve by code + continue reasons | **PASS** (code path) |
| IVR digit routing | `ivr_digit` + IVRMenu | **PASS** (code path) |
| Conference join/leave | resolve + `conference_leave` | **PASS** (code path) |
| MoH / announcements | APP_MEDIA URIs in queue enter plan | **PASS** (code path) |
| Events publish | EventEmitter + listeners | **PASS** (code path) |
| platformUuid correlation | CallSession + events + Redis | **PASS** |
| Live media-app e2e | RTPengine + queue/IVR SIP apps | Pending lab |

```bash
npm run telecom:validate:phase13

# Lab DNIS overlay (Redis):
# SET vsp:dnis:route:{phoneNumberId} '{"kind":"QUEUE","id":"<uuid>","code":"8000","tenantId":"<uuid>"}'

# Continue examples:
# POST /api/v1/telecom/routing/continue { "platformUuid": "...", "reason": "ivr_digit", "digit": "1" }
# POST /api/v1/telecom/routing/continue { "platformUuid": "...", "reason": "queue_timeout" }
# POST /api/v1/telecom/routing/continue { "platformUuid": "...", "reason": "conference_leave", "lineId": "..." }
```

---

## 6. Phase 13 completion statement

Phase 13 delivers **enterprise call application runtime** on frozen Phases 1–12:

- Queue enter, MOH, announcements, agent selection, timeout, overflow, and retry via `routing/continue`
- IVR prompt playback, DTMF routing to Line/Queue/Conference/Voicemail
- Conference join/leave/moderation with recording lifecycle hooks
- Prompt catalog and Music-on-Hold URI management (ops env, no new Prisma tables)
- Internal dial-by-`code` and inbound DNIS Redis overlay for Queue/IVR/Conference entry
- Domain events for queue, IVR, and conference with `platformUuid` as business correlator

**Stop boundary:** Phase 14 not started (BLF, SLA, supervisor features, AI transcription, speech analytics, compliance dashboards).

---

## Event catalog (Phase 13)

### Queue events

| Event | Trigger |
|-------|---------|
| `queue.entered` | Caller enters queue |
| `queue.agent_offered` | Agent FORK/SERIAL issued |
| `queue.announcement` | Position/welcome prompts |
| `queue.timeout` | Max wait exceeded |
| `queue.overflow` | Overflow destination applied |
| `QueueJoined` | Domain event on enter |

### IVR events

| Event | Trigger |
|-------|---------|
| `ivr.started` | Session created |
| `ivr.prompt_played` | APP_MEDIA prompt issued |
| `ivr.digit` | DTMF received |
| `ivr.completed` | Menu destination chosen |
| `ivr.timeout` | No input timeout |

### Conference events

| Event | Trigger |
|-------|---------|
| `conference.joined` | Participant joined |
| `conference.left` | Participant left |
| `conference.muted` / `conference.unmuted` | Moderation |
| `conference.locked` | Conference locked |
| `conference.recording_hook` | Recording started from policy |

---

## Files touched (Phase 13 only)

| Area | Files |
|------|-------|
| Queue | `apps/api/src/modules/queue/runtime/**`, `events/**`, `queue-core.module.ts` |
| IVR | `apps/api/src/modules/ivr/runtime/**`, `events/**`, `ivr-core.module.ts` |
| Conference | `apps/api/src/modules/conference/runtime/**`, `events/**`, `conference-core.module.ts` |
| Voicemail | `apps/api/src/modules/voicemail/runtime/**`, `voicemail-core.module.ts` |
| Call media | `apps/api/src/modules/call-media/**` |
| Telecom routing | `call-apps-resolver.service.ts`, `routing-continue.service.ts`, `routing.service.ts` |
| Telecom API | `telecom.controller.ts`, `telecom.service.ts`, `telecom.request.dto.ts`, `module.ts` |
| Redis | `telecom-redis.service.ts` (queue/ivr/conference/dnis keys) |
| Config | `.env.example`, `env.validation.ts`, `package.json` |
| Validation | `scripts/telecom/validate-phase13.cjs`, `validate-phase9.cjs` (health mode) |

**Frozen (not modified):** `prisma/schema.prisma`, Kamailio SIP cfg.
