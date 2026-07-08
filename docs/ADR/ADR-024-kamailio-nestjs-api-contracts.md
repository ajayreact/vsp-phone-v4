# ADR-024: Kamailio ↔ NestJS API Contracts

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | Telecom / Backend |
| **Informed** | Engineering |

---

## Overview

This ADR freezes the **HTTP contracts** between Kamailio and NestJS for SIP digest auth, routing, lifecycle events, and recording intents.

Aligns with [ADR-013](ADR-013-api-standards.md), [TEL-KAM-002](../04-telecom/kamailio-telecom-integration-architecture.md), [TEL-RT-001](../04-telecom/enterprise-sip-call-flows-runtime-architecture.md), [IMP-S5-001](../09-implementation/sprint-5-engineering-blueprint.md).

---

## Context

Kamailio must remain a thin SIP executor. Business decisions require well-defined, authenticated, timeout-bounded APIs.

---

## Decision

### 1. Base path & format

- Prefix: `/api/v1/telecom/...`
- JSON only; UTC timestamps; UUID identifiers ([ADR-013](ADR-013-api-standards.md)).

### 2. Service authentication

Kamailio → NestJS uses **mutual TLS and/or HMAC service credentials**. Not end-user JWT. Routes must not be public internet-callable without edge ACL.

### 3. Endpoints (normative)

#### `POST /api/v1/telecom/auth/sip-digest`

| | |
|--|--|
| **Purpose** | Validate SIP digest for REGISTER / authenticated INVITE |
| **Request** | `{ aor, username, realm, nonce, response, method, uri, srcIp? }` |
| **Response 200** | `{ allow: true, tenantId, deviceId, lineId?, expiresSec }` or `{ allow: false }` |
| **Timeout** | Target ≤ 200ms cached; hard 2s |
| **Idempotency** | Cache assertion by nonce+user short TTL |

#### `POST /api/v1/telecom/routing/resolve`

| | |
|--|--|
| **Purpose** | Allocate `platformUuid` + Route Plan for new INVITE |
| **Request** | `{ callerAor?, requestUri, callId, to, from, dnis?, cli?, intentHint? }` |
| **Response 200** | `{ platformUuid, tenantId, callIntent, actions[], recording, rtp, timers }` |
| **Errors** | 403 policy; 404 DNIS/extension; 503 fail-closed |
| **Timeout** | Hard 2s |
| **Idempotency** | `Idempotency-Key` or hash(`callId`+`requestUri`) short TTL |

#### `POST /api/v1/telecom/routing/continue`

| | |
|--|--|
| **Purpose** | Next hop after queue timeout, IVR digit, overflow, transfer resolve |
| **Request** | `{ platformUuid, reason, digit?, agentDeviceId?, seq }` |
| **Response** | Route Plan fragment |
| **Timeout** | Hard 2s |

#### `POST /api/v1/telecom/events`

| | |
|--|--|
| **Purpose** | Async lifecycle batch (`call.*`, `registration.*`, …) |
| **Request** | `{ eventId, type, platformUuid?, callId?, tenantId, ts, payload }` |
| **Response** | `{ accepted: true }` |
| **Idempotency** | Unique `eventId` |
| **Timeout** | Ack 5s; process async |

#### `POST /api/v1/telecom/recording/intent`

| | |
|--|--|
| **Purpose** | pause / resume / stop recording for `platformUuid` |
| **Request** | `{ platformUuid, action, seq }` |
| **Timeout** | 2s |

### 4. Route Plan shape (normative abstract)

```text
platformUuid, tenantId, callIntent
actions[]: FORK | SERIAL | BRIDGE_CARRIER | APP_MEDIA | VOICEMAIL | REJECT
recording { enabled, direction, pauseAllowed }
rtp { flags }
timers { noAnswerSec, queueRingSec, ivrTimeoutSec }
```

Kamailio executes actions; it does not reinterpret business policy.

### 5. OpenAPI

Wave 1 Phase 7 publishes OpenAPI stubs matching this ADR before thick dialplan logic.

---

## Consequences

### Positive

- Clear ownership; testable contracts; fail-closed semantics.

### Negative

- Hot-path latency budget is tight; caching required for auth.

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Embedded Lua dialplan for all routing | Duplicates NestJS / Prisma truth |
| gRPC-only | HTTP simpler for Kamailio ops; gRPC optional later |

---

## References

- IMP-S5-001 §5 API Inventory  
- Sprint 5 phases: 7–11, 14–15, 18  
