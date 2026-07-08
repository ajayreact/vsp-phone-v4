# ADR-014: Event-Driven Architecture

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved event-driven architecture** for VSP Phone v4. It defines the event flow, event bus technology, approved domain events, and rules governing event publication and consumption.

These decisions align with:

- [ADR-001](ADR-001-overall-system-architecture.md) — Event Driven Internal Architecture
- [ADR-003](ADR-003-telephony-platform-decisions.md) — Internal architecture is Event Driven
- [ADR-004](ADR-004-call-architecture.md) — Every Call publishes Events
- [ADR-013](ADR-013-api-standards.md) — Correlation IDs

This ADR does **not** define event code, payloads, schemas, or bus configuration.

---

## Table of Contents

1. [Event-Driven Architecture Flow](#1-event-driven-architecture-flow)
2. [Domain Events](#2-domain-events)
3. [Internal Event Bus](#3-internal-event-bus)
4. [Subscribers](#4-subscribers)
5. [Initial Event Bus — NestJS EventEmitter](#5-initial-event-bus--nestjs-eventemitter)
6. [Future Event Bus — NATS](#6-future-event-bus--nats)
7. [Future Event Bus — Kafka](#7-future-event-bus--kafka)
8. [Approved Domain Events](#8-approved-domain-events)
9. [Events Are Immutable](#9-events-are-immutable)
10. [Business Logic Publishes Events](#10-business-logic-publishes-events)
11. [Subscribers Are Loosely Coupled](#11-subscribers-are-loosely-coupled)
12. [Events Never Call Business Logic Directly](#12-events-never-call-business-logic-directly)
13. [Summary](#13-summary)
14. [References](#14-references)

---

## 1. Event-Driven Architecture Flow

### Context

VSP Phone v4 modules — call, queue, recording, billing, audit, notification, reporting — must communicate without tight coupling. A defined event flow establishes how domain changes propagate through the platform.

### Decision

**The approved event-driven architecture flow is:**

```
Domain Events
      ↓
Internal Event Bus
      ↓
Subscribers
```

### Reasoning

- Implements Event Driven Internal Architecture ([ADR-001](ADR-001-overall-system-architecture.md))
- Separates event production (domain layer) from event distribution (bus) from event consumption (subscribers)
- Supports modular monolith evolution without synchronous cross-module dependencies
- Aligns with DDD domain events in the domain model

### Consequences

- All internal cross-module communication follows this three-layer pattern
- Domain modules publish events; they do not call subscriber modules directly
- Event bus is a shared infrastructure concern within the NestJS application
- External system integration (webhooks, carriers) is downstream of subscribers, not direct from domain events

---

## 2. Domain Events

### Context

Significant business state changes — user creation, call lifecycle transitions, device assignment — must be communicated as first-class domain concepts, not implementation details of a single module.

### Decision

**Domain Events represent significant business state changes within the platform.**

### Reasoning

- Core DDD pattern aligned with domain model aggregates ([Domain Model](../03-database/domain-model.md))
- `CallSession` aggregate emits `CallStarted` and `CallEnded` in domain model design
- Domain events carry business meaning independent of infrastructure
- Distinguishes domain events from integration events and API webhooks

### Consequences

- Domain events are defined in domain/business terms
- Each domain event corresponds to a meaningful business occurrence
- Event payloads carry domain data required by subscribers (schema deferred)
- Domain event naming follows approved catalog (see Section 8)

---

## 3. Internal Event Bus

### Context

Domain events must be distributed to multiple subscribers without the publisher knowing which subscribers exist. A bus decouples producers from consumers.

### Decision

**An Internal Event Bus distributes domain events to subscribers within the NestJS application.**

### Reasoning

- Central distribution mechanism for event-driven internal architecture
- Enables multiple subscribers per event without publisher awareness
- Supports loose coupling between modules
- Initial implementation uses NestJS EventEmitter; future migration to NATS or Kafka supported

### Consequences

- All domain event publication goes through the Internal Event Bus
- Subscribers register with the bus for event types they consume
- Bus technology may change (EventEmitter → NATS → Kafka) without changing domain event definitions
- Bus configuration and error handling are deferred to implementation

---

## 4. Subscribers

### Context

Platform modules consume domain events to perform downstream actions — audit logging, notifications, billing, reporting, webhooks — without being called directly by the publishing module.

### Decision

**Subscribers consume domain events from the Internal Event Bus.**

### Reasoning

- Implements loose coupling between publishing and consuming modules
- Supports multiple independent reactions to the same domain event
- Aligns with Platform Services in domain model (Audit, Notifications, Billing, Reporting)
- Subscribers do not affect the outcome of the publishing business operation

### Consequences

- Modules register as subscribers for relevant domain events
- Subscriber failures do not roll back the publishing transaction (handling deferred)
- Subscribers are idempotent where possible ([ADR-013](ADR-013-api-standards.md))
- Subscriber modules include `audit`, `notification`, `billing`, `reporting`, `webhook`

---

## 5. Initial Event Bus — NestJS EventEmitter

### Context

The platform launches as a NestJS modular monolith. The initial event bus must integrate natively with NestJS without additional infrastructure dependencies.

### Decision

**The initial Internal Event Bus uses NestJS EventEmitter.**

### Reasoning

- Native NestJS integration; no additional infrastructure at launch
- Sufficient for in-process event distribution within modular monolith
- Supports event-driven architecture from day one without NATS/Kafka operational overhead
- Migration path to external bus is explicitly planned (see Sections 6 and 7)

### Consequences

- Domain events are published via NestJS EventEmitter at initial launch
- Event distribution is in-process within a single application instance
- Horizontal scaling requires external bus for cross-instance event delivery (future)
- EventEmitter configuration is deferred to implementation

---

## 6. Future Event Bus — NATS

### Context

As the platform scales horizontally, in-process EventEmitter cannot distribute events across multiple application instances. A lightweight message broker is needed for cross-instance event delivery.

### Decision

**NATS is approved as a future Internal Event Bus technology.**

### Reasoning

- Lightweight, cloud-native message broker aligned with **Cloud Native** principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Supports horizontal application scaling ([ADR-006](ADR-006-database-design.md))
- Lower operational complexity than Kafka for initial external bus migration
- Common choice for event-driven microservices and modular monolith evolution

### Consequences

- NATS migration is planned when cross-instance event delivery is required
- Domain event definitions are unchanged by bus technology migration
- NATS subject naming and configuration are deferred to future ADR
- Implementation is explicitly not in initial launch scope

---

## 7. Future Event Bus — Kafka

### Context

High-volume event streams — call events, audit logs, CDRs — may require durable, high-throughput event persistence and replay capabilities beyond NATS.

### Decision

**Kafka is approved as a future Internal Event Bus technology.**

### Reasoning

- Supports millions of call records and high-volume event streams ([ADR-006](ADR-006-database-design.md))
- Durable event log enables replay, audit, and analytics use cases
- Aligns with future partitioning for Call Sessions and Audit Logs ([ADR-006](ADR-006-database-design.md))
- Implementation explicitly deferred to future phase

### Consequences

- Kafka is the long-term target for high-volume durable event streams
- Migration from EventEmitter may progress EventEmitter → NATS → Kafka as scale requires
- Kafka topic design and partitioning are deferred to future ADRs
- Not required at initial launch

---

## 8. Approved Domain Events

### Context

An open-ended event catalog creates integration inconsistency. Initial domain events must be explicitly approved to establish the published language for subscribers.

### Decision

The following **domain events are approved**:

| Event | Domain Area |
|-------|-------------|
| `UserCreated` | User / Identity |
| `DeviceAssigned` | Device / Line |
| `LineCreated` | Line / Telephony |
| `NumberAssigned` | Phone Number |
| `CallStarted` | Call / Telephony |
| `CallAnswered` | Call / Telephony |
| `CallEnded` | Call / Telephony |
| `RecordingStarted` | Recording |
| `QueueJoined` | Queue |
| `QueueLeft` | Queue |

No additional domain events are approved beyond this list without a new ADR.

### Reasoning

- Covers core provisioning, call lifecycle, recording, and queue events
- Aligns with `CallStarted` and `CallEnded` in domain model ([Domain Model](../03-database/domain-model.md))
- Aligns with call event publishing in [ADR-004](ADR-004-call-architecture.md)
- Establishes initial published language for subscribers

### Consequences

- Subscribers are built against this approved event catalog
- New domain events require a new ADR
- Event payloads include Platform UUID and `tenant_id` where applicable (schema deferred)
- Additional call lifecycle events from [ADR-004](ADR-004-call-architecture.md) may be added via future ADR

---

## 9. Events Are Immutable

### Context

Domain events represent historical facts about business state changes. Mutable events would undermine audit trails, event replay, and subscriber idempotency.

### Decision

**Domain events are immutable.**

### Reasoning

- Events represent facts that occurred at a point in time
- Immutability supports audit trail integrity ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Enables safe event replay on bus migration (EventEmitter → NATS → Kafka)
- Standard event sourcing and domain event pattern requirement

### Consequences

- Published events are never modified after publication
- Corrections are published as new events, not mutations of existing events
- Event payloads are snapshots at time of occurrence
- Event store retention and immutability enforcement are deferred to implementation

---

## 10. Business Logic Publishes Events

### Context

Domain events must originate from business operations, not from infrastructure or subscriber modules. The publisher must be the module that performed the business state change.

### Decision

**Business logic publishes domain events.**

### Reasoning

- Domain events represent business state changes, not infrastructure signals
- Publishing module owns the aggregate that changed state (DDD pattern)
- Prevents infrastructure layers from generating business events without domain context
- Aligns with every call publishes events ([ADR-004](ADR-004-call-architecture.md))

### Consequences

- NestJS domain services and application services publish events after successful state changes
- Infrastructure modules (Kamailio integration, RTPengine) do not publish domain events directly
- Event publication occurs within the same transaction context as the state change (handling deferred)
- Subscribers do not publish events on behalf of other modules

---

## 11. Subscribers Are Loosely Coupled

### Context

Tight coupling between event publishers and subscribers defeats the purpose of event-driven architecture. Subscribers must operate independently of the publisher's implementation.

### Decision

**Subscribers are loosely coupled to event publishers.**

### Reasoning

- Core goal of event-driven internal architecture ([ADR-001](ADR-001-overall-system-architecture.md))
- Publishers do not know which subscribers exist or what they do
- New subscribers can be added without modifying publishing modules
- Supports modular monolith module independence

### Consequences

- Publishers publish events without referencing subscriber modules
- Subscribers depend on event type and payload contract, not publisher implementation
- Adding a new subscriber requires no changes to the publishing module
- Subscriber registration is declarative, not hard-coded in publishers

---

## 12. Events Never Call Business Logic Directly

### Context

Using events to trigger synchronous business operations in other modules creates hidden coupling, circular dependencies, and unpredictable execution order.

### Decision

**Events never call business logic directly.**

### Reasoning

- Prevents event subscribers from becoming disguised synchronous service calls
- Maintains unidirectional flow: business logic → event → subscriber reaction
- Avoids circular event chains (A publishes → B subscribes and publishes → A subscribes)
- Subscribers perform side effects (audit, notify, report), not core business operations of other modules

### Consequences

- Subscribers react to events with side effects only
- A subscriber must not invoke domain services of the publishing module
- Cross-module business operations use application services, not event callbacks
- Event chains are limited to subscriber side effects, not business logic orchestration

---

## 13. Summary

### Architecture Flow

```
Domain Events → Internal Event Bus → Subscribers
```

### Event Bus

| Phase | Technology |
|-------|------------|
| Initial | NestJS EventEmitter |
| Future | NATS |
| Future | Kafka |

### Approved Domain Events

`UserCreated`, `DeviceAssigned`, `LineCreated`, `NumberAssigned`, `CallStarted`, `CallAnswered`, `CallEnded`, `RecordingStarted`, `QueueJoined`, `QueueLeft`

### Rules

| Rule | Value |
|------|-------|
| Event mutability | Immutable |
| Event publisher | Business logic |
| Subscriber coupling | Loose |
| Events calling business logic | Prohibited |

---

## 14. References

- [ADR-001: Overall System Architecture](ADR-001-overall-system-architecture.md)
- [ADR-003: Telephony Platform Decisions](ADR-003-telephony-platform-decisions.md)
- [ADR-004: Call Architecture](ADR-004-call-architecture.md)
- [ADR-013: API Standards](ADR-013-api-standards.md)
- [Domain Model](../03-database/domain-model.md)
- [ADR Index](./README.md)
