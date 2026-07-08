# ADR-003: Telephony Platform Decisions

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved telephony architecture** for VSP Phone v4. It defines how users, lines, devices, phone numbers, call routing, carrier interconnect, call identity, and platform-wide telephony conventions are structured.

These decisions align with:

- [ADR-001](ADR-001-overall-system-architecture.md) — Event Driven, Carrier Agnostic, API First principles
- [ADR-002](ADR-002-tenant-domain-model.md) — Tenant isolation and resource ownership
- [Domain Model](../03-database/domain-model.md) — Line as telephony identity
- [Call Architecture](../architecture/call-architecture.md) — Call domain module boundaries

This ADR does **not** define database tables, Prisma models, SIP configuration, or implementation details.

---

## Table of Contents

1. [Users may have multiple Devices](#1-users-may-have-multiple-devices)
2. [Users may own multiple Lines](#2-users-may-own-multiple-lines)
3. [One Line may ring multiple Devices](#3-one-line-may-ring-multiple-devices)
4. [One Line may have multiple Phone Numbers](#4-one-line-may-have-multiple-phone-numbers)
5. [Multiple Phone Numbers may terminate on one Line](#5-multiple-phone-numbers-may-terminate-on-one-line)
6. [One Phone Number may route to Queue, IVR, Conference, Voicemail, or Line](#6-one-phone-number-may-route-to-queue-ivr-conference-voicemail-or-line)
7. [Single identity across all Devices](#7-single-identity-across-all-devices)
8. [SIP registrations expire automatically](#8-sip-registrations-expire-automatically)
9. [Multiple Carriers supported](#9-multiple-carriers-supported)
10. [BYOC supported](#10-byoc-supported)
11. [Carrier failover supported](#11-carrier-failover-supported)
12. [Every Call receives a global UUID](#12-every-call-receives-a-global-uuid)
13. [Internal architecture is Event Driven](#13-internal-architecture-is-event-driven)
14. [Soft Delete for all entities](#14-soft-delete-for-all-entities)
15. [Full Audit Trail](#15-full-audit-trail)
16. [Summary](#16-summary)
17. [References](#17-references)

---

## 1. Users may have multiple Devices

### Context

Enterprise users commonly operate across multiple endpoints — desk phones, softphones, and mobile clients. A single-device-per-user model would not reflect real-world usage.

### Decision

**Users may have multiple Devices.**

### Reasoning

- Supports multi-endpoint workstyles within a single User identity
- Aligns with device reassignment and lifecycle decisions in [ADR-002](ADR-002-tenant-domain-model.md)
- Enables simultaneous availability across registered endpoints
- Reflects standard UCaaS user experience expectations

### Consequences

- User–Device association is one-to-many within a Tenant
- Call delivery logic must account for multiple Devices per User
- Device inventory and administration operate at User scope within Tenant boundaries
- Device capability and registration details are deferred to future ADRs

---

## 2. Users may own multiple Lines

### Context

Users may require more than one telephony identity — for example, separate lines for roles, departments, or calling contexts within the same organization.

### Decision

**Users may own multiple Lines.**

### Reasoning

- A Line represents a telephony identity in the approved domain model
- Multiple Lines per User supports complex enterprise calling scenarios without duplicate User records
- Aligns with the approved domain model User–Line relationship
- Preserves Tenant as the isolation boundary while allowing flexible identity assignment

### Consequences

- User–Line ownership is one-to-many within a Tenant
- Each Line maintains its own telephony identity attributes (extension, caller ID, policies)
- User administration must support Line assignment and visibility
- Default Line selection behavior is deferred to future ADRs

---

## 3. One Line may ring multiple Devices

### Context

A telephony identity must reach a user wherever they are available. Ringing only one Device would limit reachability for users with multiple endpoints.

### Decision

**One Line may ring multiple Devices.**

### Reasoning

- Maximizes answer probability for a given Line identity
- Aligns with the approved domain model where Line owns Devices
- Supports simultaneous and sequential ring strategies (strategy details deferred)
- Complements the decision that Users may have multiple Devices

### Consequences

- Line–Device ringing is one-to-many
- Call delivery for a Line may target multiple registered Devices
- Ring group behavior and timeout rules are deferred to future ADRs
- Device state affects whether a Device participates in ringing

---

## 4. One Line may have multiple Phone Numbers

### Context

Organizations assign multiple external numbers to the same person or role — direct lines, marketing numbers, or regional DIDs pointing to one identity.

### Decision

**One Line may have multiple Phone Numbers.**

### Reasoning

- Reflects common enterprise number assignment patterns
- Avoids duplicate Line records for the same telephony identity
- Aligns with Line ownership of Phone Numbers in the approved domain model
- Supports flexible inbound number management per Line

### Consequences

- Line–Phone Number association is one-to-many
- Outbound caller ID may reference any Phone Number owned by the Line (selection rules deferred)
- Number administration attaches numbers to Lines within Tenant scope
- Number-to-Line assignment history may be required for audit purposes

---

## 5. Multiple Phone Numbers may terminate on one Line

### Context

Inbound calls from different external numbers may need to reach the same telephony identity. This is the inbound perspective of Line–Phone Number ownership.

### Decision

**Multiple Phone Numbers may terminate on one Line.**

### Reasoning

- Ensures inbound calls to any assigned number reach the intended Line identity
- Complements the decision that one Line may have multiple Phone Numbers
- Aligns with approved domain model Rule 11
- Supports consolidated call handling for a single user or role

### Consequences

- Inbound routing resolves multiple Phone Numbers to a single Line target
- Call logging and reporting must associate inbound calls with both Phone Number and terminating Line
- Conflicting termination targets for the same Phone Number are not permitted

---

## 6. One Phone Number may route to Queue, IVR, Conference, Voicemail, or Line

### Context

Inbound Phone Numbers serve diverse purposes — direct extension reach, automated menus, queue entry, conference bridges, or voicemail. The platform must support all approved routing targets.

### Decision

**One Phone Number may route to Queue, IVR, Conference, Voicemail, or Line.**

### Reasoning

- Covers the full set of approved inbound routing destinations in the domain model
- Supports contact center, auto-attendant, conferencing, and direct-dial scenarios
- Aligns with approved domain model Rule 12
- Provides a single routing model for all inbound number types

### Consequences

- Each Phone Number has exactly one active routing target at a time from the approved set
- Routing changes are tenant-scoped administrative operations
- Routing evaluation occurs on inbound call arrival (mechanism deferred)
- Additional routing targets beyond this approved set require a future ADR

---

## 7. Single identity across all Devices

### Context

Users with multiple Devices must present a consistent telephony identity to callers and colleagues. Fragmented identities across endpoints create confusion and routing errors.

### Decision

**A User maintains a single telephony identity across all Devices through their Line(s).**

### Reasoning

- Ensures consistent caller experience regardless of which Device answers
- Aligns Line as the telephony identity anchor in the approved domain model
- Supports unified presence, voicemail, and caller ID per Line
- Differentiates User account identity from Line telephony identity without fragmenting Line ownership

### Consequences

- Devices ring under Line identity, not independent per-Device identities
- Presence and caller ID are Line-owned attributes applied consistently across Devices
- Users with multiple Lines may present multiple identities — one per Line
- Identity federation with external directories is deferred to future ADRs

---

## 8. SIP registrations expire automatically

### Context

SIP endpoints register with the platform to receive calls. Stale registrations from disconnected or decommissioned endpoints must not persist indefinitely.

### Decision

**SIP registrations expire automatically.**

### Reasoning

- Prevents routing calls to unreachable or decommissioned endpoints
- Aligns with standard SIP registration lifecycle behavior
- Supports accurate Device availability for call delivery
- Reduces security risk from abandoned registrations

### Consequences

- All SIP registrations have a finite lifetime and require periodic refresh
- Expired registrations must not receive inbound call delivery
- Registration expiry and refresh behavior are platform-managed (details deferred)
- Relationship between SIP registration state and Device state is governed by this decision

---

## 9. Multiple Carriers supported

### Context

Enterprise customers require carrier choice for cost, coverage, compliance, and existing carrier relationships. A single-carrier platform limits market reach.

### Decision

**Multiple Carriers are supported.**

### Reasoning

- Implements the approved **Carrier Agnostic** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Enables tenant and platform flexibility in carrier selection
- Aligns with the `carrier` module boundary and future carrier abstraction in the domain model
- Telnyx is the initial approved carrier; additional carriers are permitted by this decision

### Consequences

- Carrier is a tenant-scoped resource in the domain model
- Platform must accommodate more than one carrier interconnect
- Carrier-specific configuration and normalization are required (details deferred)
- Initial implementation may target one carrier while architecture supports expansion

---

## 10. BYOC supported

### Context

Enterprise customers often maintain existing carrier contracts and require the platform to interconnect with their own carrier trunks rather than platform-provisioned carrier services.

### Decision

**Bring Your Own Carrier (BYOC) is supported.**

### Reasoning

- Addresses enterprise requirement for existing carrier relationships
- Complements Multiple Carriers support and Carrier Agnostic principle
- Expands addressable market to customers with established carrier contracts
- Aligns with the `carrier` module boundary for carrier interconnect management

### Consequences

- Tenants may connect via platform-provisioned carriers or their own carrier trunks
- BYOC onboarding and validation workflows are required (details deferred)
- Security and interconnect policies for tenant-provided carriers must be defined in future ADRs
- Billing and support models may differ between platform and BYOC carriers

---

## 11. Carrier failover supported

### Context

Carrier interconnect failures cause call disruption. Enterprise-grade telephony requires resilience when a primary carrier path is unavailable.

### Decision

**Carrier failover is supported.**

### Reasoning

- Supports the approved **High Availability** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Reduces single-carrier dependency for critical call paths
- Complements Multiple Carriers and BYOC decisions
- Aligns with carrier-grade platform expectations

### Consequences

- Platform must support alternate carrier routing when primary carrier is unavailable
- Failover triggers, scope, and recovery behavior are deferred to future ADRs
- Failover applies to outbound and potentially inbound paths (scope deferred)
- Carrier health monitoring is an implied platform capability (details deferred)

---

## 12. Every Call receives a global UUID

### Context

Calls traverse multiple platform components — signaling, media, application services, billing, and audit. A single, platform-wide call identifier is required for correlation across these layers.

### Decision

**Every Call receives a global UUID.**

### Reasoning

- Provides a unique, platform-wide identifier for each call session
- Enables correlation across Kamailio, RTPengine, NestJS, billing, recording, and audit systems
- Resolves the previously pending Call UUID strategy in [Call Architecture](../architecture/call-architecture.md)
- Supports `CallSession` as the call identity aggregate in the domain model

### Consequences

- All call-related events, records, and integrations reference the global call UUID
- UUID generation and assignment timing are deferred to future ADRs
- Relationship between global UUID and SIP-level identifiers is deferred to future ADRs
- Call UUID is immutable for the lifetime of the call session

---

## 13. Internal architecture is Event Driven

### Context

Telephony domains — call control, routing, recording, billing, notifications — must interact without tight coupling. Synchronous-only integration limits scalability and resilience.

### Decision

**The internal telephony architecture is Event Driven.**

### Reasoning

- Implements the approved **Event Driven** architecture principle and Event Driven Internal Architecture style ([ADR-001](ADR-001-overall-system-architecture.md))
- Enables loose coupling between telephony modules (`call`, `queue`, `ivr`, `recording`, `billing`, etc.)
- Supports asynchronous propagation of call lifecycle events (`CallStarted`, `CallEnded`)
- Aligns with the approved domain event model in [Call Architecture](../architecture/call-architecture.md)

### Consequences

- Call state changes publish domain events consumed by downstream modules
- Event bus technology, delivery guarantees, and schemas are deferred to future ADRs
- Module boundaries communicate through events in addition to direct APIs where appropriate
- Event ordering and idempotency requirements apply to telephony event consumers

---

## 14. Soft Delete for all entities

### Context

Telephony configuration — Lines, Devices, Phone Numbers, Queues, IVR flows — changes frequently. Permanent deletion risks data loss and breaks historical reporting.

### Decision

**Soft Delete applies to all telephony entities.**

### Reasoning

- Aligns with [ADR-002](ADR-002-tenant-domain-model.md) — every business entity supports soft delete
- Preserves historical call, billing, and audit context for deactivated resources
- Supports resource recovery after administrative errors
- Maintains referential integrity for historical call records

### Consequences

- Deactivated telephony resources remain in the system in soft-deleted state
- Active queries must exclude soft-deleted entities by default
- Reactivation of soft-deleted resources is supported within Tenant scope (details deferred)
- Unique constraints must account for soft-deleted records (implementation deferred)

---

## 15. Full Audit Trail

### Context

Telephony configuration changes — routing, number assignment, device provisioning, carrier settings — require full traceability for compliance, security, and operational accountability.

### Decision

**A full Audit Trail is maintained for all telephony entities and operations.**

### Reasoning

- Aligns with [ADR-002](ADR-002-tenant-domain-model.md) — every business entity supports audit history
- Implements the **Security First** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Supports the Audit Platform Service in the approved domain model
- Enables forensic review of telephony configuration and call-related administrative actions

### Consequences

- All telephony entity lifecycle changes are auditable
- Audit events are scoped to Tenant context
- Audit retention, immutability, and access controls are deferred to future ADRs
- The `audit` module boundary consumes telephony audit events

---

## 16. Summary

| # | Decision | Domain |
|---|----------|--------|
| 1 | Users may have multiple Devices | User / Device |
| 2 | Users may own multiple Lines | User / Line |
| 3 | One Line may ring multiple Devices | Line / Device |
| 4 | One Line may have multiple Phone Numbers | Line / Phone Number |
| 5 | Multiple Phone Numbers may terminate on one Line | Inbound routing |
| 6 | One Phone Number may route to Queue, IVR, Conference, Voicemail, or Line | Inbound routing |
| 7 | Single identity across all Devices | Line identity |
| 8 | SIP registrations expire automatically | SIP / Device |
| 9 | Multiple Carriers supported | Carrier |
| 10 | BYOC supported | Carrier |
| 11 | Carrier failover supported | Carrier |
| 12 | Every Call receives a global UUID | Call identity |
| 13 | Internal architecture is Event Driven | Platform architecture |
| 14 | Soft Delete for all entities | Data lifecycle |
| 15 | Full Audit Trail | Compliance |

---

## 17. References

- [ADR-001: Overall System Architecture](ADR-001-overall-system-architecture.md)
- [ADR-002: Tenant Domain Model](ADR-002-tenant-domain-model.md)
- [Domain Model](../03-database/domain-model.md)
- [Call Architecture](../architecture/call-architecture.md)
- [Kamailio Architecture](../04-telecom/kamailio-architecture.md)
- [ADR Index](./README.md)
