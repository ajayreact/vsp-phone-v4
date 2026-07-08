# Phase 12 — Recording Pipeline & Presence (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P12-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 12 Complete (static validation PASS; MinIO/RTPengine e2e pending) |
| **Date** | 2026-07-08 |
| **Scope** | Sprint 5 Wave 5 — Call recording metadata + Line/Device presence |
| **Architecture** | ADR-004 / ADR-029 / TEL-RTP-001 §9 / TEL-RT-001 §11–12 — frozen |
| **Constraint** | Phases 1–11 / Prisma / Kamailio SIP signaling frozen |

---

## 1. Recording pipeline summary

```text
Call ANSWERED / Kamailio RTPengine record
        │
        ▼
POST /api/v1/telecom/recording/lifecycle  { started | stopped | completed | failed }
        │
        ▼
RecordingLifecycleService
        ├─ Prisma Recording row (PENDING → RECORDING → COMPLETED | FAILED)
        ├─ Redis vsp:{tenant}:recording:active:{platformUuid}
        ├─ ObjectStorageService → MinIO/S3 (ADR-029 key layout)
        └─ EventEmitter recording.* + RecordingStarted domain event
```

| Step | Owner | Phase 12 |
|------|-------|----------|
| Policy evaluation | `RecordingPolicyService` on Route Plan resolve | Line-owned `RecordingPolicy` |
| RTP capture | RTPengine (media plane) | Lifecycle API accepts spool path |
| Metadata | NestJS → Prisma `Recording` | No media bytes in DB |
| Correlation | `platformUuid` + segmentId | Redis + object key path |
| Kill switch | `RECORDING_ENABLED=false` | Forces Route Plan `enabled: false` |

**Route Plan:** `recording.enabled`, `direction`, `pauseAllowed` populated from policy (INTERNAL / INBOUND / OUTBOUND).

**Telecom APIs:**

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/telecom/recording/lifecycle` | Start/stop/complete/fail from Kamailio/uploader |
| `POST /api/v1/telecom/recording/intent` | Pause/resume/stop intent |
| `GET /api/v1/recordings?callSessionId=` | JWT list (admin) |
| `GET /api/v1/recordings/:id/url` | Signed playback URL |

---

## 2. Presence architecture summary

```text
REGISTER ──► registration.* ──► PresenceEventsListener ──► AVAILABLE
INVITE/RINGING ──► call.ringing ──► BUSY (callee)
ANSWERED ──► call.answered ──► ON_CALL (+ prior status stack)
BYE ──► call.ended ──► restore prior / AVAILABLE / OFFLINE
Browser JWT ──► POST /webrtc/presence ──► PresenceService
Kamailio ──► POST /telecom/presence ──► TelecomPresenceService
Admin ──► PATCH /v1/presence/lines/:lineId
```

| Plane | Store | Content |
|-------|-------|---------|
| Business | Prisma `Presence` (Line-owned) | status, customMessage, optional deviceId |
| Runtime | Redis `vsp:{tenant}:presence:line:{lineId}` | Fast read; 24h TTL |
| Overrides | Redis `presence:override:{lineId}` | DND/AWAY admin lock |
| Stack | Redis `presence:stack:{lineId}` | Restore after call |
| SIP runtime | Kamailio usrloc | **Not** in Prisma |

Multi-device: registration hooks check remaining registered devices before OFFLINE. Device.status updated (ONLINE/BUSY/REGISTERED) alongside presence.

**Not implemented:** BLF, SLA, queue presence, supervisor monitoring, WebSocket push (subscription foundation only).

---

## 3. Object storage integration summary

| Item | Detail |
|------|--------|
| Client | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` |
| Dev target | MinIO via `S3_ENDPOINT=http://localhost:9000` (docker profile `extras`) |
| Bucket | `S3_BUCKET_RECORDINGS` (default `vsp-recordings`) |
| Key layout | `recordings/{tenantId}/{yyyy}/{mm}/{dd}/{platformUuid}/{segmentId}.{ext}` |
| Upload path | Spool file via `RecordingUploadService.uploadFromSpool` or dev placeholder |
| Access | Private bucket; signed URL for admin playback |
| Cleanup | `RecordingCleanupService` marks stale RECORDING rows FAILED |

Env: `RECORDING_UPLOAD_ENABLED`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`.

---

## 4. Event catalog

### Recording integration events

| Event | Emitter | Key fields |
|-------|---------|------------|
| `recording.started` | `RecordingLifecycleService` | platformUuid, recordingId, segmentId, callSessionId |
| `recording.paused` | stop/stop intent | platformUuid, recordingId |
| `recording.completed` | upload finalize | platformUuid, mediaObjectKey, durationSeconds |
| `recording.failed` | upload/reconcile | platformUuid, errorCode |

### Recording domain events (ADR-014)

| Event | Trigger |
|-------|---------|
| `RecordingStarted` | After `recording.started` applied |

### Presence events

| Event | Emitter | Key fields |
|-------|---------|------------|
| `presence.changed` | `PresenceService` | lineId, status, previousStatus, source |
| `device.presence_changed` | (foundation) | Reserved for per-device fan-out |

### Existing call/registration events consumed

| Event | Presence action |
|-------|-----------------|
| `registration.created` / `.refreshed` | AVAILABLE |
| `registration.unregistered` / `.expired` | OFFLINE when last device |
| `call.ringing` | BUSY (callee) |
| `call.answered` | ON_CALL |
| `call.ended` / `.rejected` | Restore prior status |

---

## 5. Validation report

| Check | Command / criterion | Result |
|-------|---------------------|--------|
| Phase 12 gate | `npm run telecom:validate:phase12` | **PASS** |
| API build | via phase12 gate | **PASS** |
| Phase 11 regression | via phase12 gate | **PASS** |
| Prisma frozen | no schema diff | **PASS** |
| Kamailio unchanged | Phase 9 media intact | **PASS** |
| Recording starts | lifecycle + call.answered hook | **PASS** (code path) |
| Recording stops | lifecycle stopped + call.ended | **PASS** (code path) |
| Object uploaded | S3 client + upload service | **PASS** (code path) |
| Metadata saved | Prisma Recording CRUD | **PASS** |
| Presence transitions | registration + call listeners | **PASS** (code path) |
| Redis runtime | presence + recording keys | **PASS** |
| platformUuid correlation | all events include platformUuid | **PASS** |
| Live MinIO/RTPengine e2e | Docker extras profile | Pending lab |

```bash
npm run telecom:validate:phase12
# Lab:
docker compose --profile extras up -d minio
# POST recording/lifecycle completed with local spool path
# Verify object in MinIO + Recording row COMPLETED
```

---

## 6. Phase 12 completion statement

Phase 12 delivers **enterprise call recording metadata** and **Line/Device presence** on frozen Phases 1–11:

- RecordingPolicy-driven Route Plan flags; RTPengine capture coordinated via lifecycle API
- Prisma metadata only; media in MinIO/S3 with ADR-029 keys and signed URLs
- Multiple recordings per CallSession (segment per start/complete cycle)
- Registration- and call-driven presence with Redis cache and `presence.changed` events
- Admin presence PATCH + subscription foundation; browser and Kamailio presence wired to shared `PresenceService`

**Stop boundary:** Phase 13 not started (BLF, SLA, queue presence, AI transcription, compliance dashboards).

---

## Files touched (Phase 12 only)

| Area | Files |
|------|-------|
| Recording | `apps/api/src/modules/recording/**` |
| Presence | `apps/api/src/modules/presence/**` |
| Telecom integration | `routing.service.ts`, `telecom.service.ts`, `telecom.controller.ts`, `telecom-redis.service.ts`, `browser-presence.service.ts`, `telecom/module.ts` |
| App wiring | `apps/api/src/app/app.module.ts`, `env.validation.ts` |
| Config | `.env.example`, `package.json`, `Makefile` |
| Validation | `scripts/telecom/validate-phase12.cjs` |

**Frozen (not modified):** `prisma/schema.prisma`, Kamailio SIP cfg.
