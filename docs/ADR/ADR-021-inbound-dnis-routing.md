# ADR-021: Inbound DNIS Routing

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | Telecom Architecture |
| **Informed** | Engineering |

---

## Overview

This ADR freezes **how inbound PSTN (and equivalent DNIS) destinations are resolved** into a NestJS Route Plan. Kamailio does not own dialplan business rules.

Aligns with [ADR-003](ADR-003-telephony-platform-decisions.md), [ADR-010](ADR-010-carrier-abstraction.md), [TEL-CAR-001](../04-telecom/telnyx-carrier-integration-architecture.md), [TEL-RT-001](../04-telecom/enterprise-sip-call-flows-runtime-architecture.md).

---

## Context

Inbound Telnyx INVITEs arrive with a dialed number (DNIS). The platform must map E.164 → Tenant-owned destination (Line, Queue, IVR, Conference, Voicemail) with policy checks.

---

## Decision

### 1. Authoritative resolver

NestJS `POST /api/v1/telecom/routing/resolve` is the sole DNIS authority for new inbound INVITEs.

### 2. Inputs

| Field | Source |
|-------|--------|
| `dnis` | Request-URI / To user normalized to E.164 |
| `cli` | From / PAI (presentation; may be anonymous) |
| `callId` | SIP Call-ID (telecom corr only) |
| Carrier source | Kamailio ACL-proven Telnyx (or future carrier) |

### 3. Resolution order

1. Normalize DNIS to E.164.  
2. Lookup `PhoneNumber` by E.164 within platform (tenant-scoped ownership).  
3. Reject if unknown, unassigned, or wrong carrier binding.  
4. Resolve destination from number assignment / Line routing rules: **Line | Queue | IVR | Conference | Voicemail | Reject**.  
5. Apply CallPolicy / TenantFeature / hours / anonymous rejection.  
6. Allocate `platformUuid` + return Route Plan actions.

### 4. Durable routing data

- Use existing Telephony models (`PhoneNumber`, assignments, Line-owned policies).  
- **Do not** invent a parallel Prisma “NumberRoute” table in Wave 1 unless a later ADR explicitly adds it. Runtime may use in-memory resolution over current associations.

### 5. Fail closed

If NestJS is unreachable or DNIS unknown → Kamailio rejects INVITE (no local guess routing). Emergency fail-open is **out of scope** (future ADR-051).

### 6. Anonymous CLI

Presentation stored on CallSession business fields as received; policy may reject anonymous inbound. Raw SIP privacy headers are not Prisma columns.

---

## Consequences

### Positive

- Single routing brain; carrier-agnostic.

### Negative

- Sync dependency on NestJS for every inbound call.

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Kamailio dialplan DB for DNIS | Duplicates Telephony domain |
| Telnyx Call Control apps | Violates SIP-trunk architecture (TEL-CAR-001) |

---

## References

- TEL-CAR-001 §5, TEL-RT-001 §6  
- Sprint 5 phases: 10, 12, 15  
