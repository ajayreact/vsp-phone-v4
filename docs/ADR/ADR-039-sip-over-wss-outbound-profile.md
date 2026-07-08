# ADR-039: SIP over WSS & Outbound Profile

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | Telecom Architecture |
| **Informed** | Engineering |

---

## Overview

This ADR freezes **Kamailio WebSocket Secure (WSS) registrar/proxy behavior** for browser softphones, including Outbound/Path expectations.

Aligns with [ADR-008](ADR-008-kamailio-architecture.md), [ADR-012](ADR-012-webrtc-mobile-signaling.md), [TEL-WRTC-001](../04-telecom/webrtc-signaling-architecture.md), [TEL-KAM-002](../04-telecom/kamailio-telecom-integration-architecture.md).

---

## Context

Browser contacts are ephemeral WebSocket connections. Shared location + Path/Outbound are required for multi-node Kamailio to route mid-dialog and in-dialog requests correctly.

---

## Decision

### 1. Listener

- Kamailio terminates **WSS** on the SIP VIP (TLS cert from Phase 2).  
- Same logical registrar as TLS desk phones; transport differs.

### 2. Registration profile

| Item | Decision |
|------|----------|
| Outbound (RFC 5626) | **Preferred** — support Flow-Token / Outbound semantics when client offers |
| Path (RFC 3327) | **Required** for WSS registrations so any Kamailio node can reach the contact |
| Expires | Honor NestJS `expiresSec` policy from digest auth; clamp to platform max/min |
| Keepalive | WebSocket ping / SIP OPTIONS as configured; document client responsibility |

### 3. Location

- Bindings in **shared Redis** (same store as desk).  
- Store socket / received / path needed to send requests back to the browser flow.

### 4. Auth

- Digest via ADR-024 / ADR-025 enroll credentials.  
- Strip untrusted `X-VSP-*` headers from browser.

### 5. Load balancing

- Sticky WSS at LB is nice-to-have; **must not** be required if Path/Outbound + shared location work.  
- Document sticky as optimization only.

---

## Consequences

### Positive

- HA-safe softphone registration; aligns with TEL-WRTC-001.

### Negative

- Slightly more complex registrar cfg than classic UDP.

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Sticky-only without Path | Breaks on LB reshuffle |
| Separate softphone SBC product | Extra vendor; delayed Sprint 5 |

---

## References

- TEL-WRTC-001 § Browser Registration, TEL-KAM-002  
- Sprint 5 phases: 5, 9, 16, 21  
