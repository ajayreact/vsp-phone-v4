# Phase 7 — Route Resolution & CallSession (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P7-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 7 Complete (static validation PASS; softphone e2e pending Docker) |
| **Date** | 2026-07-08 |
| **Scope** | Sprint 5 Wave 2 — INVITE routing + CallSession |
| **ADRs** | ADR-019, ADR-021 (internal only), ADR-024, ADR-004 |
| **Constraint** | Phases 1–6 / Prisma schema / architecture frozen; no RTP/PSTN/Queue |

---

## 1. Routing flow

```text
INVITE (initial)
  → Kamailio route[INVITE]
  → POST /api/v1/telecom/routing/resolve
       { callerAor, requestUri, callId, to, from, intentHint: INTERNAL }
  → NestJS RoutingService.resolve:
       resolve caller Line (AoR/extension)
       resolve dest Line (extension or AoR)
       tenant isolation
       CallPolicy inbound/outbound
       busy check (active CallSession on toLine)
       load Redis registrations for dest devices
       create CallSession + participants (no sipCallId)
       allocate platformUuid
       Redis corr + runtime cache
       emit call.created
  → Route Plan { FORK contacts… } or REJECT
  → Kamailio: inject X-VSP-Platform-UUID; append_branch forks; t_relay
  → POST /call/start → RINGING
  → 180 / 200 (UA plane; media not rewritten)
```

REGISTER path (`route[REGISTRAR]`) unchanged.

---

## 2. Route Plan

| Field | Content |
|-------|---------|
| `platformUuid` | UUID v4 — business correlator |
| `callSessionId` | Persisted CallSession id |
| `callIntent` | `INTERNAL` (PSTN → REJECT `PSTN_NOT_ENABLED`) |
| `actions[]` | `FORK` per contact (`target`, `deviceId`, `priority`) or `REJECT` (`rejectCode` 403/404/480/486/503) |
| `forkContacts` / `forkContactsCsv` | Kamailio branch list |
| `recording` | disabled |
| `rtp.flags` | unset (media stubbed) |
| `timers.noAnswerSec` | 30 |
| `callerIdName` / `callerIdNumber` | from Line.CallerID when present |
| `placeholder` | `false` |

Alias: `POST /api/v1/telecom/route` → same handler.

---

## 3. CallSession summary

| Action | Detail |
|--------|--------|
| Create on resolve | `state=DIALING`, `callType=INTERNAL`, `startedAt=now` |
| Participants | CALLER (from Line), CALLEE (to Line), per-device CALLEE legs |
| **sipCallId** | **Never written** (ADR-019). Column remains in frozen schema unused |
| Lifecycle | `/call/start` → RINGING; `/call/update` ANSWERED/HOLD; `/call/end` → ENDED |
| Busy | Existing active session on `toLineId` → REJECT 486 |

---

## 4. platformUuid propagation

| Layer | Mechanism |
|-------|-----------|
| NestJS | Allocated in `resolve`; returned in body |
| Redis | `vsp:{tenant}:corr:sip:{callId}`, `corr:platform:{uuid}`, `call:{uuid}` |
| Kamailio | `append_hf("X-VSP-Platform-UUID: …")` after strip of inbound untrusted |
| HTTP | Response + logging interceptor echo header |

---

## 5. Event summary

| Event | When |
|-------|------|
| `call.created` | Successful resolve + CallSession insert |
| `call.ringing` | `/call/start` or RINGING update |
| `call.answered` | ANSWERED update |
| `call.ended` | `/call/end` |
| `call.rejected` | Policy / busy / no devices / PSTN |

Listener: `CallEventsListener` (structured logs).

---

## 6. Validation report

| Check | Result |
|-------|--------|
| `npx nx build api` | **PASS** |
| `npm run telecom:validate:phase7` | **PASS** |
| Kamailio static validate | **PASS** |
| Prisma schema diff | **None** |
| No `sipCallId` on create | **PASS** |
| INVITE foundation 503 stub removed | **PASS** |
| REGISTER intact | **PASS** |
| No `rtpengine_offer/answer` | **PASS** |
| Softphone INVITE e2e | Pending Docker + seeded Lines/Extensions/registrations |

---

## 7. Artifact index

| Path | Role |
|------|------|
| `apps/api/src/modules/telecom/routing/routing.service.ts` | Resolve + CallSession |
| `apps/api/src/modules/telecom/events/call.events.ts` | Event contracts |
| `apps/api/src/modules/telecom/events/call-events.listener.ts` | Log sink |
| `infrastructure/kamailio/kamailio.cfg` `route[INVITE]` | HTTP route + fork |
| `scripts/telecom/validate-phase7.cjs` | Gate |

---

## 8. Known limitations

1. Internal extension/AoR only — PSTN/DNIS/Telnyx fail-closed.  
2. Media not rewritten (no RTPengine offer/answer).  
3. Busy detection is CallSession-state based, not SIP 486 from UA.  
4. `forkContactsCsv` parsing depends on Kamailio `s.select`; usrloc `lookup` is fallback.  
5. Softphone e2e not run on this host (no Docker).  
6. `routing/continue` deferred.  
7. Legacy `CallSession.sipCallId` column remains until a later Prisma hygiene phase (still unused).

---

## 9. Checklist

- [x] INVITE processing (Kamailio + NestJS)  
- [x] Route Resolution API (`/routing/resolve` + `/route`)  
- [x] CallSession creation  
- [x] platformUuid generation + header  
- [x] Internal Line → Line routing  
- [x] Multi-device ringing (FORK)  
- [x] Device selection / priority  
- [x] Route Plan generation  
- [x] Call lifecycle init (`/call/*`)  
- [x] Call events  
- [x] Redis runtime + corr cache  
- [x] Kamailio Route API integration  
- [x] Media remains stubbed  
- [x] Stop — Phase 8 not started  

```bash
npm run build:api
npm run telecom:validate:phase7
npm run kamailio:validate
```
