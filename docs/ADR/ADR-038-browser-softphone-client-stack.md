# ADR-038: Browser Softphone Client Stack

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | Frontend / Telecom |
| **Informed** | Engineering |

---

## Overview

This ADR freezes the **browser softphone SIP stack choice** and enrollment client contract for Sprint 5 WebRTC.

Aligns with [ADR-012](ADR-012-webrtc-mobile-signaling.md), [TEL-WRTC-001](../04-telecom/webrtc-signaling-architecture.md).

---

## Context

TEL-WRTC-001 requires SIP over WSS (RFC 7118) with DTLS-SRTP via RTPengine. Teams need one UA library decision.

---

## Decision

### 1. SIP UA library

**SIP.js** is the approved browser SIP UA for Sprint 5 (maintained RFC 7118 support, TypeScript-friendly, industry usage).

JsSIP remains an acceptable alternative only if a critical SIP.js blocker is documented; default implementation is SIP.js.

### 2. Signaling transport

- WSS only to Kamailio VIP (no UDP/TCP SIP from browser).  
- Media never P2P in production; ICE force-relay via RTPengine ([TEL-RTP-001](../04-telecom/rtpengine-architecture.md)).

### 3. Enroll API (client contract)

`POST /api/v1/telecom/webrtc/enroll` (JWT) returns:

```text
sipUsername, sipPassword (or digest secret), wssUrl, expiresAt, iceServers[]
```

Client must re-enroll before expiry; revoke on logout via enroll revoke API.

### 4. Non-goals

- Native iOS/Android push (follow-on).  
- Persisting SDP/ICE in Prisma.  
- Choosing UI toolkit (Left to frontend; not architecture-blocking).

---

## Consequences

### Positive

- One stack for hiring/docs/testing.

### Negative

- Browser quirks still require compatibility matrix (Chrome/Firefox first).

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| JsSIP as default | Slightly weaker TS ergonomics for this team; keep as backup |
| Proprietary WebSocket call API (non-SIP) | Diverges from Kamailio/desk unified model |

---

## References

- TEL-WRTC-001, IMP-S5-001 Phase 16  
- Sprint 5 phases: 16, 20  
