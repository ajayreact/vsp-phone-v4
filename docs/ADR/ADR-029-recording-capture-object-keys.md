# ADR-029: Recording Capture & Object Keys

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | Telecom / Media |
| **Informed** | Engineering |

---

## Overview

This ADR freezes **how call recording is started/stopped, labeled, stored, and meta-linked** without storing media bytes or SIP state in Prisma.

Aligns with [ADR-004](ADR-004-call-architecture.md), [ADR-009](ADR-009-rtpengine-architecture.md), [TEL-RTP-001](../04-telecom/rtpengine-architecture.md), [TEL-RT-001](../04-telecom/enterprise-sip-call-flows-runtime-architecture.md).

---

## Context

RecordingPolicy is Line-owned. Capture must occur on the media plane (RTPengine). NestJS owns Recording metadata and access control.

---

## Decision

### 1. Trigger path

1. NestJS sets `recording.enabled` (+ direction, pauseAllowed) on Route Plan.  
2. Kamailio issues RTPengine NG **start/stop** (and pause/resume when allowed).  
3. Label / metadata tag on media files includes **`platformUuid`** (and segment id).  
4. NestJS writes `Recording` row on start; finalizes on `recording.completed`.

### 2. Capture method

- Prefer RTPengine recording to local spool then **async upload** to object storage (MinIO/S3).  
- Exact NG flag set is implementation detail but must support decrypted mix suitable for compliance playback when SRTP/DTLS is used (standard RTPengine recording behavior).

### 3. Object key layout

```text
recordings/{tenantId}/{yyyy}/{mm}/{dd}/{platformUuid}/{segmentId}.{ext}
```

- Bucket private; SSE/KMS required in staging/prod.  
- `Recording.mediaObjectKey` stores this key; never public ACL.

### 4. Segments

- 1:N recordings per CallSession allowed (pause/resume, PCI).  
- Each segment has own object + optional child Recording row or segment table in ops — **business** may use multiple `Recording` rows keyed by `callSessionId` (already modeled).

### 5. Prisma

- Store: `callSessionId`, `mediaObjectKey`, format, duration, status, optional `lineId` / `conferenceId`.  
- Do **not** store RTPengine call-id as a required business column.

### 6. Failure

- Upload retry with backoff; NestJS marks `FAILED` if object missing after grace.  
- Route Plan may force `recording.enabled=false` as kill switch.

---

## Consequences

### Positive

- Compliance join via `platformUuid`; clear ownership.

### Negative

- Upload path operational complexity; spooled disk on RTP nodes.

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Record on phone | Incomplete for PSTN/WebRTC; spoofable |
| NestJS consumes RTP | Violates plane separation |

---

## References

- TEL-RTP-001 §9, TEL-RT-001 §12  
- Sprint 5 phases: 6, 18, 23  
