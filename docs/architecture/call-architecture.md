# VSP Phone v4 — Call Architecture

| Field | Value |
|-------|-------|
| **Document ID** | ARCH-CALL-001 |
| **Version** | 0.1.0 |
| **Status** | Approved — domain boundaries and platform stack |
| **Last Updated** | 2026-07-08 |
| **Owner** | Architecture |
| **Location** | `docs/architecture/call-architecture.md` |

---

## Purpose

This document captures the **approved call architecture** for VSP Phone v4 as reflected in current project artifacts: workspace initialization, domain module boundaries, bounded-context definitions, and planned telecom stack.

It consolidates call-related decisions already approved. Behavioral details, state machines, identifier formats, and integration contracts that remain marked **TBD** in source documents are **not** specified here.

---

## Approved Decision Sources

| Source | Approved content relevant to calls |
|--------|-------------------------------------|
| [Software Architecture Document](../02-architecture/Software-Architecture-Document.md) | Planned stack: NestJS, Kamailio, RTPengine, Telnyx, PostgreSQL, Redis |
| [High-Level Architecture](../02-architecture/High-Level-Architecture.md) | Telecom stack layers; inbound/outbound call flows as key platform flows; SIP via Kamailio |
| [Domain-Driven Design](../02-architecture/Domain-Driven-Design.md) | `CallSession` aggregate; `CallStarted` / `CallEnded` domain events; telephony bounded contexts |
| [Low-Level Architecture](../02-architecture/Low-Level-Architecture.md) | Call control and media handling as distinct design areas (details pending) |
| `apps/api/src/modules/*` | Approved NestJS domain module boundaries for call-related capabilities |

No call-specific Architecture Decision Records (ADRs) have been recorded yet. See [ADR index](../ADR/README.md).

---

## Table of Contents

1. [Call Lifecycle](#1-call-lifecycle)
2. [Supported Call Types](#2-supported-call-types)
3. [Call UUID Strategy](#3-call-uuid-strategy)
4. [Event Model](#4-event-model)
5. [Call Features](#5-call-features)
6. [Recording Architecture](#6-recording-architecture)
7. [Conference Architecture](#7-conference-architecture)
8. [Queue Architecture](#8-queue-architecture)
9. [Presence Model](#9-presence-model)
10. [Device State Model](#10-device-state-model)
11. [Related Documents](#related-documents)
12. [Revision History](#revision-history)

---

## Architectural Context

VSP Phone v4 is a carrier-grade, multi-tenant UCaaS platform. Call handling is a **core subdomain** decomposed into explicit NestJS modules and DDD bounded contexts.

### Approved platform components (call path)

| Layer | Approved component | Role in call architecture |
|-------|-------------------|---------------------------|
| Application | NestJS (`apps/api`) | Call domain orchestration and module boundaries |
| Signaling | Kamailio | SIP proxy / registrar (planned) |
| Media | RTPengine | Media relay / NAT traversal (planned) |
| Carrier | Telnyx | PSTN / SIP trunk interconnect (planned) |
| Data | PostgreSQL | Persistent call-domain state (planned) |
| Cache | Redis | Real-time and session-oriented state (planned) |

### Approved module map (call domain)

```mermaid
flowchart TB
  subgraph application [NestJS Application Layer]
    telephony[telephony]
    call[call]
    extension[extension]
    device[device]
    phoneNumber[phone-number]
    queue[queue]
    ivr[ivr]
    voicemail[voicemail]
    conference[conference]
    recording[recording]
  end

  subgraph telecom [Telecom Integration Layer]
    sip[sip]
    kamailio[kamailio]
    rtpengine[rtpengine]
    carrier[carrier]
  end

  telephony --> call
  telephony --> extension
  telephony --> device
  telephony --> phoneNumber
  call --> queue
  call --> ivr
  call --> voicemail
  call --> conference
  call --> recording
  sip --> kamailio
  kamailio --> carrier
  rtpengine --> carrier
```

Module wiring into `AppModule` is intentionally deferred. Boundaries are approved; implementation is not started.

---

## 1. Call Lifecycle

### Approved decisions

| Decision | Status | Description |
|----------|--------|-------------|
| Call identity aggregate | **Approved** | `CallSession` is the call identity aggregate root in the **Telephony Core** bounded context |
| Lifecycle signaling events | **Approved** | `CallStarted` and `CallEnded` are recognized domain events emitted from the `CallSession` aggregate |
| Call control ownership | **Approved** | The `call` module owns **call session and call control** boundaries |
| Core orchestration ownership | **Approved** | The `telephony` module owns **core telephony domain orchestration** boundaries |
| Signaling/media separation | **Approved** | Signaling is handled via **Kamailio**; media relay via **RTPengine** (planned stack) |
| Directional flows | **Approved** | **Inbound** and **outbound** call flows are recognized as primary platform data flows (sequence details pending) |

### Pending architecture phase

The following are referenced in architecture documents but **not yet approved**:

- Call state machine and permitted transitions ([Low-Level Architecture — Call Control Logic](../02-architecture/Low-Level-Architecture.md))
- Detailed lifecycle phases (ringing, answered, held, transferred, etc.)
- SIP dialog-to-`CallSession` correlation rules
- Kamailio and RTPengine session lifecycle integration contracts

### Approved bounded contexts involved

| Bounded context | Call lifecycle role (approved scope) |
|-----------------|----------------------------------------|
| Telephony Core | Owns `CallSession` aggregate and call control |
| Call Routing | Routing and IVR-related call handling scope |
| Media & Voicemail | Voicemail and media-related call handling scope |

---

## 2. Supported Call Types

### Approved decisions

Supported call capabilities are approved at the **domain boundary** level through NestJS modules and product requirement domains. The platform recognizes the following call-related capability areas:

| Capability area | Approved module / requirement domain | Boundary description |
|-----------------|--------------------------------------|----------------------|
| Standard voice calling | `call`, `telephony`; FR-VOICE | Call session and call control |
| Extension-based calling | `extension` | Extension provisioning and assignment |
| Device endpoint calling | `device` | Endpoint and device registration |
| DID / number-based calling | `phone-number` | Phone number inventory and assignment |
| Queued calls | `queue` | Call queue and agent routing |
| IVR-routed calls | `ivr` | IVR flow and menu configuration |
| Voicemail | `voicemail` | Voicemail storage and retrieval |
| Conferencing | `conference`; FR-CONF | Conference bridge and participant management |
| Recording | `recording` | Call recording capture and retention |
| Carrier-originated/terminated calls | `carrier`, `sip` | Carrier interconnect and SIP signaling integration |

### Pending architecture phase

- Formal call type taxonomy (e.g., internal, external, inbound PSTN, outbound PSTN)
- Feature matrix per call type
- Product priority (P0–P3) per call type

---

## 3. Call UUID Strategy

### Approved decisions

| Decision | Status | Description |
|----------|--------|-------------|
| Platform call identity | **Approved** | The platform call identity is modeled as the `CallSession` aggregate in Telephony Core |
| SIP as signaling protocol | **Approved** | SIP is the approved signaling integration protocol (via Kamailio module boundary) |

### Pending architecture phase

The following have **not** been approved and must not be assumed:

- UUID format, version, or generation algorithm
- Relationship between platform call identifier and SIP `Call-ID` / dialog identifiers
- Identifier propagation across Kamailio, RTPengine, Telnyx, and NestJS layers
- Multi-leg call correlation strategy (transfer, conference, queue)

> **Note:** Until an ADR is accepted, no call UUID strategy is in effect beyond the approved `CallSession` aggregate naming.

---

## 4. Event Model

### Approved decisions

#### Domain events (Telephony Core)

| Event | Aggregate | Status | Approved scope |
|-------|-----------|--------|----------------|
| `CallStarted` | `CallSession` | **Approved** | Recognized lifecycle event; payload and consumers pending |
| `CallEnded` | `CallSession` | **Approved** | Recognized lifecycle event; payload and consumers pending |

#### Cross-cutting event categories (by module boundary)

| Module | Approved event domain |
|--------|----------------------|
| `audit` | Audit logging and compliance event boundaries |
| `webhook` | Outbound webhook delivery boundaries |
| `notification` | Notification delivery and channel boundaries |
| `billing` | Usage metering and billing boundaries |
| `reporting` | Reporting and analytics boundaries |

#### Communication patterns (platform level)

| Pattern | Approved use (high level) | Status |
|---------|----------------------------|--------|
| Domain events | Cross-context call lifecycle propagation | Approved pattern; catalog pending |
| SIP | Signaling between endpoints and platform | Approved via Kamailio |
| Event bus | Async platform integration | Listed in HLA; technology and contracts pending |

### Pending architecture phase

- Event payload schemas for `CallStarted` and `CallEnded`
- Event catalog producers and consumers ([Low-Level Architecture — Event & Messaging Design](../02-architecture/Low-Level-Architecture.md))
- Delivery guarantees, ordering, and idempotency rules
- Mapping between SIP/Kamailio events and domain events

---

## 5. Call Features

### Approved decisions

Call features are approved as **separate domain modules** under `apps/api/src/modules`. Each module defines a boundary only; services and APIs are not implemented.

| Feature domain | Module | Approved boundary |
|----------------|--------|-------------------|
| Core orchestration | `telephony` | Core telephony domain orchestration |
| Call control | `call` | Call session and call control |
| Extensions | `extension` | Extension provisioning and assignment |
| Endpoints | `device` | Endpoint and device registration |
| Numbers | `phone-number` | Phone number inventory and assignment |
| Queues | `queue` | Call queue and agent routing |
| IVR | `ivr` | IVR flow and menu configuration |
| Voicemail | `voicemail` | Voicemail storage and retrieval |
| Conferencing | `conference` | Conference bridge and participants |
| Recording | `recording` | Call recording capture and retention |
| Provisioning | `provisioning` | Service provisioning and onboarding |
| SIP integration | `sip` | SIP signaling integration |
| Kamailio integration | `kamailio` | Kamailio SIP proxy integration |
| RTPengine integration | `rtpengine` | RTPengine media relay integration |
| Carrier integration | `carrier` | Carrier interconnect and trunk management |

### Pending architecture phase

- Per-feature enablement rules per tenant
- Feature interaction matrix (e.g., recording + conference + queue)
- Product functional requirements (FR-VOICE, FR-ROUTING, FR-VM, FR-CONF) remain draft

---

## 6. Recording Architecture

### Approved decisions

| Decision | Status | Description |
|----------|--------|-------------|
| Domain ownership | **Approved** | The `recording` module owns **call recording capture and retention** boundaries |
| Media stack context | **Approved** | Recording operates within the approved media path that includes **RTPengine** (planned) |
| Billing/reporting adjacency | **Approved** | Recording-related usage may feed `billing` and `reporting` module boundaries |

### Pending architecture phase

- Recording trigger model (always-on, on-demand, policy-driven)
- Storage location, format, encryption, and retention policy
- RTPengine recording integration method
- Legal/compliance and tenant consent rules
- CDR and recording metadata linkage

---

## 7. Conference Architecture

### Approved decisions

| Decision | Status | Description |
|----------|--------|-------------|
| Domain ownership | **Approved** | The `conference` module owns **conference bridge and participant** boundaries |
| Product scope | **Approved** | Conferencing is a recognized product requirement domain (FR-CONF) |
| Call relationship | **Approved** | Conferencing is a distinct capability within the call feature set, bounded separately from base `call` session control |

### Pending architecture phase

- Bridge topology (ad-hoc vs scheduled; max participants)
- Relationship between `CallSession` and conference instances
- Media mixing architecture via RTPengine
- Participant join/leave lifecycle and events

---

## 8. Queue Architecture

### Approved decisions

| Decision | Status | Description |
|----------|--------|-------------|
| Domain ownership | **Approved** | The `queue` module owns **call queue and agent routing** boundaries |
| Routing context | **Approved** | Queue handling sits within the approved **Call Routing** bounded context alongside IVR |
| Adjacent modules | **Approved** | Queue interacts at the domain level with `call`, `extension`, and `telephony` boundaries |

### Pending architecture phase

- Queue strategy (FIFO, priority, skill-based)
- Agent state requirements and ACD behavior
- Caller experience (MOH, position announcements, callback)
- Queue metrics and reporting integration

---

## 9. Presence Model

### Approved decisions

| Decision | Status | Description |
|----------|--------|-------------|
| Product recognition | **Approved** | Presence is a recognized product requirement domain (**Presence & Directory**, FR-PRESENCE) |
| Platform communication | **Approved** | Real-time client communication is a planned communication pattern (technology pending in HLA) |

### Pending architecture phase

- Presence is **not** yet assigned a dedicated NestJS module in `apps/api/src/modules`
- Presence states, federation rules, and publication/subscription model are not approved
- Relationship between presence and queue agent availability is not approved
- Redis-backed vs alternate real-time presence storage is not approved

> **Note:** Do not implement presence behavior until FR-PRESENCE requirements and a corresponding architecture decision are approved.

---

## 10. Device State Model

### Approved decisions

| Decision | Status | Description |
|----------|--------|-------------|
| Domain ownership | **Approved** | The `device` module owns **endpoint and device registration** boundaries |
| Extension relationship | **Approved** | Devices are associated at the domain level with the `extension` module boundary |
| Signaling context | **Approved** | Device endpoints participate in the approved SIP signaling path via the `sip` and `kamailio` module boundaries |

### Pending architecture phase

- Device registration state model (registered, unregistered, unreachable, etc.)
- Multi-device per extension rules
- Device capability and provisioning model
- Real-time device state synchronization to clients
- Relationship between device state and call delivery (simultaneous ring, sequential ring, etc.)

---

## Related Documents

| Document | Relevance |
|----------|-----------|
| [Domain-Driven Design](../02-architecture/Domain-Driven-Design.md) | `CallSession` aggregate, domain events, bounded contexts |
| [High-Level Architecture](../02-architecture/High-Level-Architecture.md) | Telecom stack, inbound/outbound flows, communication patterns |
| [Low-Level Architecture](../02-architecture/Low-Level-Architecture.md) | Call control logic, event catalog, telecom component design |
| [Functional Requirements](../01-product/Functional-Requirements.md) | Voice, routing, voicemail, presence, conferencing requirement domains |
| [Telecom](../04-telecom/README.md) | SIP, media, routing, carrier documentation area |
| [ADR](../ADR/README.md) | Future call-related architecture decisions |

---

## Revision History

| Version | Date | Author | Changes |
|---------|--------|--------|---------|
| 0.1.0 | 2026-07-08 | Architecture | Initial approved call architecture based on existing project artifacts |
