# ADR-004: Call Architecture

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved call architecture** for VSP Phone v4. It defines call lifecycle states, supported call types, call identity, event model, recording responsibilities, queue strategies, presence states, and device states.

These decisions align with:

- [ADR-001](ADR-001-overall-system-architecture.md) — Event Driven Internal Architecture
- [ADR-003](ADR-003-telephony-platform-decisions.md) — Global call UUID, event-driven telephony
- [Domain Model](../03-database/domain-model.md) — `CallSession` aggregate, Line identity
- [Call Architecture](../architecture/call-architecture.md) — Call domain module boundaries

This ADR does **not** define database tables, Prisma models, API contracts, or implementation details.

---

## Table of Contents

1. [Call Lifecycle](#1-call-lifecycle)
2. [Supported Call Types](#2-supported-call-types)
3. [Platform UUID](#3-platform-uuid)
4. [Platform UUID Independence from SIP Call-ID](#4-platform-uuid-independence-from-sip-call-id)
5. [Call Event Publishing](#5-call-event-publishing)
6. [Approved Call Events](#6-approved-call-events)
7. [Recording Architecture](#7-recording-architecture)
8. [Queue Strategies](#8-queue-strategies)
9. [Presence States](#9-presence-states)
10. [Device States](#10-device-states)
11. [Summary](#11-summary)
12. [References](#12-references)

---

## 1. Call Lifecycle

### Context

Calls progress through distinct phases from creation to archival. A shared lifecycle model is required for call control, event publishing, reporting, billing, and audit across all call types and platform components.

### Decision

The approved call lifecycle states are:

| State | Description |
|-------|-------------|
| **Call Created** | Call session initiated on the platform |
| **Dialing** | Outbound call setup in progress |
| **Ringing** | Call is alerting one or more destinations |
| **Answered** | Call has been answered by a party |
| **Active** | Call is in established two-way communication |
| **Hold** | Call is temporarily suspended |
| **Transfer** | Call is being transferred to another destination |
| **Park** | Call is parked awaiting retrieval |
| **Ended** | Call session has terminated |
| **Archived** | Call session is finalized and moved to historical state |

No additional lifecycle states are approved beyond this list.

### Reasoning

- Covers the full call journey from initiation through post-call archival
- Supports event-driven propagation of lifecycle changes ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Aligns with `CallSession` as the call identity aggregate in the domain model
- Provides a consistent vocabulary for all supported call types
- Distinguishes operational states (Active, Hold, Transfer, Park) from terminal states (Ended, Archived)

### Consequences

- All call handling modules must map behavior to these approved states
- State transition rules and valid transitions between states are deferred to future ADRs
- Call reporting, billing, and audit reference this lifecycle model
- No additional lifecycle states may be introduced without a new ADR

---

## 2. Supported Call Types

### Context

VSP Phone v4 must support diverse calling scenarios across internal extensions, PSTN, contact center features, conferencing, and multiple endpoint technologies.

### Decision

The following call types are **approved**:

| Call Type | Description |
|-----------|-------------|
| **Internal** | Calls between resources within the same Tenant |
| **Inbound PSTN** | Calls originating from the public telephone network into the platform |
| **Outbound PSTN** | Calls from the platform to the public telephone network |
| **Queue** | Calls handled through a call queue |
| **IVR** | Calls interacting with an interactive voice response flow |
| **Conference** | Calls participating in a conference bridge |
| **WebRTC** | Calls using WebRTC endpoints |
| **Mobile** | Calls using mobile client endpoints |
| **SIP** | Calls using SIP protocol endpoints |
| **Desk Phone** | Calls using hardware desk phone endpoints |

No additional call types are approved beyond this list.

### Reasoning

- Covers enterprise UCaaS scenarios from basic extension dialing to contact center and conferencing
- Distinguishes protocol/endpoint types (WebRTC, Mobile, SIP, Desk Phone) from routing types (Queue, IVR, Conference)
- Aligns with approved domain modules: `call`, `queue`, `ivr`, `conference`, `carrier`
- Supports PSTN interconnect via approved carrier architecture ([ADR-003](ADR-003-telephony-platform-decisions.md))

### Consequences

- Call type classification is required for every call session
- Modules responsible for each call type are bounded by approved NestJS modules
- Feature behavior may vary by call type within the shared lifecycle model
- Additional call types require a future ADR

---

## 3. Platform UUID

### Context

Calls traverse multiple platform layers — signaling, media, application services, billing, and audit. A single platform-wide identifier is required for correlation across these components.

### Decision

**Every Call has a Platform UUID.**

### Reasoning

- Implements the approved decision that every call receives a global UUID ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Provides immutable call identity for the `CallSession` aggregate
- Enables correlation across Kamailio, RTPengine, NestJS, recording, billing, and audit systems
- Supports event-driven call tracking with a stable identifier

### Consequences

- Platform UUID is assigned at call creation
- All call events, metadata, and integrations reference the Platform UUID
- Platform UUID is the authoritative call identifier within VSP Phone v4
- UUID format and generation mechanism are deferred to future ADRs

---

## 4. Platform UUID Independence from SIP Call-ID

### Context

SIP signaling uses its own `Call-ID` header for dialog identification. The platform requires a signaling-independent identifier that persists across SIP dialog changes, transfers, and multi-leg scenarios.

### Decision

**The Platform UUID is independent from the SIP Call-ID.**

### Reasoning

- SIP Call-ID may change across transfers, forks, and carrier handoffs
- Platform UUID provides stable correlation for the entire call session lifecycle
- Separates platform domain identity from SIP protocol identity
- Supports multi-leg calls and complex routing without fragmenting platform call records

### Consequences

- Platform UUID and SIP Call-ID are stored and correlated separately
- Multiple SIP Call-IDs may map to one Platform UUID during a call session
- Signaling layer (Kamailio) and application layer (NestJS) must maintain correlation mapping (details deferred)
- SIP Call-ID remains relevant for signaling operations but is not the platform call identity

---

## 5. Call Event Publishing

### Context

The platform adopts an event-driven internal architecture. Call lifecycle changes must be communicated to downstream modules — recording, billing, audit, notifications, reporting, and webhooks — without tight coupling.

### Decision

**Every Call publishes Events.**

### Reasoning

- Implements Event Driven Internal Architecture ([ADR-001](ADR-001-overall-system-architecture.md))
- Implements event-driven telephony architecture ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Enables loose coupling between `call`, `recording`, `billing`, `audit`, `notification`, `reporting`, and `webhook` modules
- Replaces or supplements synchronous-only call state propagation

### Consequences

- Call state changes produce publishable events
- Event consumers operate asynchronously relative to call control
- Event delivery guarantees, bus technology, and schemas are deferred to future ADRs
- All approved call events reference the Platform UUID

---

## 6. Approved Call Events

### Context

Downstream modules require a defined set of call events to react to lifecycle changes. An open-ended event catalog would create integration inconsistency.

### Decision

The following call events are **approved**:

| Event | Description |
|-------|-------------|
| `call.created` | Call session created on the platform |
| `call.ringing` | Call is alerting destinations |
| `call.answered` | Call has been answered |
| `call.hold` | Call placed on hold |
| `call.transfer` | Call transfer initiated |
| `call.recording.started` | Call recording has started |
| `call.ended` | Call session has ended |

No additional call events are approved beyond this list.

### Reasoning

- Maps to key lifecycle transitions and recording start
- Provides sufficient coverage for billing, audit, notification, and reporting integration
- Aligns with approved lifecycle states (Created, Ringing, Answered, Hold, Transfer, Ended)
- Establishes a published language for event consumers

### Consequences

- Event consumers must handle this approved event catalog
- Event payloads must include Platform UUID (schema deferred)
- Additional events (e.g., `call.parked`, `call.archived`) require a future ADR
- Events not in this list must not be published as platform-standard call events

---

## 7. Recording Architecture

### Context

Call recording involves both media capture and metadata management. Responsibilities must be clearly separated between the media layer and the application layer.

### Decision

- **RTPengine handles media recording.**
- **NestJS stores metadata only.**

### Reasoning

- Aligns with approved signaling/media separation — RTPengine owns media path responsibilities
- Keeps NestJS focused on domain orchestration and metadata per modular monolith architecture
- Avoids duplicating media handling in the application layer
- Supports recording under Line-owned Recording Policy in the domain model

### Consequences

- Media recording files are produced by RTPengine, not NestJS
- NestJS `recording` module stores recording metadata (duration, Platform UUID, tenant, line references)
- `call.recording.started` event signals recording initiation to downstream consumers
- Storage location, format, encryption, and retention for media files are deferred to future ADRs

---

## 8. Queue Strategies

### Context

Call queues require configurable agent selection strategies to support different contact center operating models.

### Decision

The following queue strategies are **approved**:

| Strategy | Description |
|----------|-------------|
| **Round Robin** | Distribute calls evenly across agents in rotation |
| **Least Calls** | Route to the agent with the fewest active or recent calls |
| **Longest Idle** | Route to the agent who has been idle the longest |
| **Ring All** | Alert all available agents simultaneously |
| **Priority** | Route based on agent or caller priority ranking |

No additional queue strategies are approved beyond this list.

### Reasoning

- Covers standard contact center routing patterns
- Aligns with the `queue` module boundary in the domain model
- Supports diverse tenant operating models within a defined strategy set
- Complements Queue call type in supported call types

### Consequences

- Each Queue configuration selects one approved strategy
- Agent availability for queue routing interacts with Presence states
- Strategy-specific behavior details and metrics are deferred to future ADRs
- Additional strategies require a future ADR

---

## 9. Presence States

### Context

Presence indicates user availability for call delivery, queue routing, and directory display. A defined state model prevents inconsistent availability signaling across the platform.

### Decision

The following presence states are **approved**:

| State | Description |
|-------|-------------|
| **Available** | User is available to receive calls |
| **Busy** | User is busy and should not receive new calls |
| **On Call** | User is actively on a call |
| **Away** | User is temporarily unavailable |
| **DND** | User has enabled Do Not Disturb |
| **Offline** | User is not connected or reachable |

No additional presence states are approved beyond this list.

### Reasoning

- Resolves the previously pending presence model in [Call Architecture](../architecture/call-architecture.md)
- Aligns with Line-owned Presence in the approved domain model
- Supports call delivery decisions and queue agent availability
- Covers standard UCaaS presence semantics

### Consequences

- Presence is published and consumed using this approved state set
- Presence transitions affect call routing and queue agent selection
- Presence source of truth and federation rules are deferred to future ADRs
- Additional presence states require a future ADR

---

## 10. Device States

### Context

Devices (endpoints) require a defined state model for registration status, connectivity, and operational readiness. Device state affects call delivery when Lines ring multiple Devices.

### Decision

The following device states are **approved**:

| State | Description |
|-------|-------------|
| **Registered** | Device has an active SIP registration |
| **Unregistered** | Device has no active SIP registration |
| **Online** | Device is connected and reachable |
| **Offline** | Device is not connected |
| **Busy** | Device is on an active call |
| **Provisioning** | Device is being provisioned or configured |

No additional device states are approved beyond this list.

### Reasoning

- Resolves the previously pending device state model in [Call Architecture](../architecture/call-architecture.md)
- Aligns with SIP registration expiry decision ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Supports Line-to-Device ringing decisions based on device readiness
- Covers registration, connectivity, and lifecycle states

### Consequences

- Device state is tracked using this approved state set
- Unregistered and Offline devices do not receive inbound call delivery
- Device state changes may affect Presence and call routing
- State transition rules and synchronization to clients are deferred to future ADRs
- Additional device states require a future ADR

---

## 11. Summary

### Call Lifecycle

Call Created → Dialing → Ringing → Answered → Active → Hold → Transfer → Park → Ended → Archived

### Supported Call Types

Internal, Inbound PSTN, Outbound PSTN, Queue, IVR, Conference, WebRTC, Mobile, SIP, Desk Phone

### Call Identity

| Decision | Value |
|----------|-------|
| Platform UUID | Every call has one |
| SIP Call-ID | Independent from Platform UUID |

### Approved Events

`call.created`, `call.ringing`, `call.answered`, `call.hold`, `call.transfer`, `call.recording.started`, `call.ended`

### Recording

RTPengine — media | NestJS — metadata only

### Queue Strategies

Round Robin, Least Calls, Longest Idle, Ring All, Priority

### Presence States

Available, Busy, On Call, Away, DND, Offline

### Device States

Registered, Unregistered, Online, Offline, Busy, Provisioning

---

## 12. References

- [ADR-001: Overall System Architecture](ADR-001-overall-system-architecture.md)
- [ADR-003: Telephony Platform Decisions](ADR-003-telephony-platform-decisions.md)
- [Domain Model](../03-database/domain-model.md)
- [Call Architecture](../architecture/call-architecture.md)
- [Kamailio Architecture](../04-telecom/kamailio-architecture.md)
- [ADR Index](./README.md)
