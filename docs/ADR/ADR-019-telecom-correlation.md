# ADR-019: Telecom Correlation (`platformUuid` Header & Redis Maps)

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | Telecom Architecture |
| **Informed** | Engineering |

---

## Overview

This ADR freezes the **cross-layer correlation contract** for VSP Phone v4: how `platformUuid` is allocated, propagated on SIP, stored in Redis, and joined to business CallSession — without placing SIP protocol identifiers in Prisma.

Aligns with [ADR-004](ADR-004-call-architecture.md), [TEL-KAM-002](../04-telecom/kamailio-telecom-integration-architecture.md), [TEL-RT-001](../04-telecom/enterprise-sip-call-flows-runtime-architecture.md).

---

## Context

Calls span NestJS, Kamailio, RTPengine, Telnyx, and media apps. SIP Call-ID changes on transfer/re-INVITE. Business CDR, recording, and support tooling need one stable ID.

---

## Decision

### 1. Business correlator

- NestJS allocates `CallSession.platformUuid` (UUID v4) on `routing/resolve` for each new business call.
- Kamailio **must not** invent business UUIDs for CDR.

### 2. SIP header

| Item | Value |
|------|-------|
| Header name | `X-VSP-Platform-UUID` |
| Direction | Injected by Kamailio **only after** NestJS returns `platformUuid` |
| Client trust | Strip any inbound `X-VSP-*` from untrusted UAs before auth |

### 3. Redis maps (telecom layer only)

Key prefix: `vsp:{tenantId}:corr:`

| Key | Value | TTL |
|-----|-------|-----|
| `vsp:{tenantId}:corr:sip:{sipCallId}` | `{ platformUuid, legs[] }` | dialog life + grace (≥ 2h) |
| `vsp:{tenantId}:corr:platform:{platformUuid}` | `{ sipCallIds[], rtpIds[], telnyxCallId?, carrierCode? }` | same |
| `vsp:{tenantId}:corr:telnyx:call:{id}` | `{ platformUuid, tenantId }` | same |
| `vsp:{tenantId}:corr:rtp:{rtpSessionId}` | `{ platformUuid }` | same |

### 4. Remap rules

- Transfer / REFER / ICE restart may add SIP Call-IDs; always remap to the **same** `platformUuid`.
- RTPengine session labels / recording object keys include `platformUuid`.

### 5. Prisma ban

- **Forbidden** in business schema: SIP Call-ID, dialog IDs, Contact URIs, SDP, ICE, DTLS, RTPengine session IDs, Telnyx call IDs as required business columns.
- Existing `CallSession.sipCallId` (if present) is a **Wave 1 Phase 4 blocker** and must be removed before telecom persistence — not redesigned as “allowed protocol storage.”

---

## Consequences

### Positive

- Stable support joins across planes; transfer-safe.

### Negative

- Redis becomes critical for live correlation; requires HA.

### Neutral

- Observability always logs `tenantId` + `platformUuid`.

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Use SIP Call-ID as business ID | Breaks on transfer |
| Store Call-ID in Prisma | Violates frozen boundary |
| Kamailio-generated UUID | Business layer loses allocation authority |

---

## References

- TEL-KAM-002 §14, TEL-RT-001, TEL-CAR-001, TEL-RTP-001  
- Sprint 5 phases: 3, 10, 11, 14–18, 20  
