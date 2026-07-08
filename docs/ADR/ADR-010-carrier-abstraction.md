# ADR-010: Carrier Abstraction

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved carrier abstraction architecture** for VSP Phone v4. It defines the carrier layer, adapter pattern, approved carriers, routing integration, rules, and Carrier Adapter responsibilities.

These decisions align with:

- [ADR-001](ADR-001-overall-system-architecture.md) — Carrier Agnostic, Telnyx, API First
- [ADR-003](ADR-003-telephony-platform-decisions.md) — Multiple Carriers, BYOC, carrier failover
- [ADR-006](ADR-006-database-design.md) — SIP and carrier configuration separate from business entities
- [ADR-008](ADR-008-kamailio-architecture.md) — Telnyx through Kamailio; Carrier Adapter in outbound routing
- [Domain Model](../03-database/domain-model.md) — Carrier entity, Phone Number

This ADR does **not** define carrier integration code, API clients, or implementation details.

---

## Table of Contents

1. [Initial Carrier — Telnyx](#1-initial-carrier--telnyx)
2. [Future Carriers](#2-future-carriers)
3. [Carrier Layer Architecture](#3-carrier-layer-architecture)
4. [Business Logic Never Communicates Directly with Telnyx](#4-business-logic-never-communicates-directly-with-telnyx)
5. [All Carrier Communication Through Carrier Adapter](#5-all-carrier-communication-through-carrier-adapter)
6. [Carriers Are Interchangeable](#6-carriers-are-interchangeable)
7. [BYOC Supported](#7-byoc-supported)
8. [Multiple Carriers per Tenant Supported](#8-multiple-carriers-per-tenant-supported)
9. [Automatic Carrier Failover Supported](#9-automatic-carrier-failover-supported)
10. [Carrier-Specific Settings Isolated from Business Logic](#10-carrier-specific-settings-isolated-from-business-logic)
11. [Carrier Adapter Responsibilities](#11-carrier-adapter-responsibilities)
12. [Summary](#12-summary)
13. [References](#13-references)

---

## 1. Initial Carrier — Telnyx

### Context

VSP Phone v4 requires an initial carrier for PSTN interconnect and number provisioning at launch. A single starting carrier must be designated while the architecture supports future expansion.

### Decision

**Telnyx is the initial carrier.**

### Reasoning

- Telnyx is the approved carrier in the technology stack ([ADR-001](ADR-001-overall-system-architecture.md))
- Telnyx connects through Kamailio for SIP signaling ([ADR-008](ADR-008-kamailio-architecture.md))
- Provides PSTN and SIP trunking for inbound and outbound call types ([ADR-004](ADR-004-call-architecture.md))
- First carrier integration target while abstraction supports additional carriers

### Consequences

- Initial development and provisioning target Telnyx APIs and trunks
- Telnyx-specific logic resides only in the Telnyx Carrier Adapter implementation
- Business logic and Routing Engine interact with Carrier Adapter, not Telnyx directly
- Telnyx is the default carrier path; not the only permitted carrier

---

## 2. Future Carriers

### Context

The platform must support carrier choice for cost, coverage, compliance, and customer preference beyond the initial Telnyx integration.

### Decision

The following **future carriers** are approved for the carrier abstraction architecture:

| Carrier | Type |
|---------|------|
| **Bandwidth** | CPaaS / PSTN carrier |
| **Twilio** | CPaaS / PSTN carrier |
| **Plivo** | CPaaS / PSTN carrier |
| **Custom SIP Trunks** | BYOC / customer-provided SIP interconnect |

No additional carriers are approved beyond this list without a new ADR.

### Reasoning

- Implements **Carrier Agnostic** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Approved future carrier targets from platform planning
- Custom SIP Trunks covers BYOC scenarios ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Each future carrier receives its own Carrier Adapter implementation

### Consequences

- Carrier abstraction is designed to accommodate all listed carriers
- Implementation priority beyond Telnyx is deferred
- Each carrier adapter normalizes to the same Carrier Adapter interface
- Additional carriers require a new ADR

---

## 3. Carrier Layer Architecture

### Context

Carrier interconnect spans application logic, routing decisions, and SIP signaling. A clear vertical architecture prevents coupling between business modules and carrier-specific protocols.

### Decision

**The approved carrier layer architecture is:**

```
Carrier Layer
      ↓
Carrier Adapter
      ↓
Routing Engine
      ↓
Kamailio
```

### Reasoning

- Separates carrier integration (Carrier Layer / Adapter) from routing logic (Routing Engine) and signaling (Kamailio)
- Aligns with outbound routing: Device → Kamailio → Carrier Adapter → Telnyx ([ADR-008](ADR-008-kamailio-architecture.md))
- Routing Engine resolves business routing; Carrier Adapter handles carrier-specific operations
- Kamailio executes SIP signaling to carrier trunks

### Consequences

- Business modules interact with Carrier Layer, not Kamailio or carriers directly
- Carrier Adapter sits between Routing Engine and carrier APIs/trunks
- Routing Engine does not contain carrier-specific logic
- Kamailio receives signaling instructions from the carrier path, not business logic directly

---

## 4. Business Logic Never Communicates Directly with Telnyx

### Context

Direct coupling between NestJS business modules and Telnyx APIs would embed carrier-specific logic throughout the application and prevent carrier interchangeability.

### Decision

**Business logic never communicates directly with Telnyx.**

### Reasoning

- Enforces Carrier Adapter as the sole carrier integration boundary
- Telnyx is the initial carrier, not a special case bypassing abstraction
- Aligns with carrier-specific settings isolated from business logic
- Supports future carrier additions without changing business modules

### Consequences

- No Telnyx SDK or API calls in `telephony`, `call`, `phone-number`, or other business modules
- All Telnyx interaction is encapsulated in the Telnyx Carrier Adapter
- Business logic depends on Carrier Adapter interface, not Telnyx types
- Applies equally to all carriers — no direct carrier API calls in business logic

---

## 5. All Carrier Communication Through Carrier Adapter

### Context

Multiple carriers with different APIs, webhooks, and error formats require a single integration boundary that normalizes carrier operations for the platform.

### Decision

**All carrier communication goes through the Carrier Adapter.**

### Reasoning

- Centralizes carrier integration in the `carrier` module boundary
- Implements anti-corruption layer pattern from domain-driven design
- Enables interchangeable carriers with a consistent platform interface
- Single point for webhooks, error translation, and provisioning operations

### Consequences

- Inbound carrier events arrive at Carrier Adapter, not business modules directly
- Outbound carrier operations are invoked through Carrier Adapter
- Each carrier has a dedicated adapter implementation (Telnyx, Bandwidth, etc.)
- Carrier Adapter interface is stable; implementations vary per carrier

---

## 6. Carriers Are Interchangeable

### Context

Tenants and the platform must be able to select, switch, or combine carriers without rewriting business logic or routing rules.

### Decision

**Carriers are interchangeable.**

### Reasoning

- Core **Carrier Agnostic** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Carrier Adapter normalizes differences between Telnyx, Bandwidth, Twilio, Plivo, and Custom SIP Trunks
- Routing Engine and business logic operate on normalized carrier concepts
- Supports multiple carriers per tenant with consistent behavior

### Consequences

- Switching a tenant's carrier does not require business logic changes
- Carrier selection is a configuration concern, not a code change per tenant
- Normalized models for numbers, trunks, and events are defined at Carrier Adapter boundary (details deferred)
- Carrier capability differences are handled within adapters, not exposed to business logic

---

## 7. BYOC Supported

### Context

Enterprise customers require interconnect with their own carrier contracts via custom SIP trunks rather than platform-provisioned carrier services.

### Decision

**Bring Your Own Carrier (BYOC) is supported.**

### Reasoning

- Approved in [ADR-003](ADR-003-telephony-platform-decisions.md)
- Custom SIP Trunks is an approved future carrier type
- Expands addressable market to customers with existing carrier relationships
- BYOC trunks connect through Kamailio with tenant-specific configuration ([ADR-008](ADR-008-kamailio-architecture.md))

### Consequences

- Tenants may use platform carriers (Telnyx, etc.) or BYOC custom SIP trunks
- BYOC is implemented via Custom SIP Trunks Carrier Adapter
- BYOC onboarding, validation, and IP allow lists are carrier adapter concerns
- Billing and support models may differ for BYOC tenants (deferred)

---

## 8. Multiple Carriers per Tenant Supported

### Context

Tenants may use different carriers for different numbers, regions, or cost optimization. Single-carrier-per-tenant limits operational flexibility.

### Decision

**Multiple carriers per Tenant are supported.**

### Reasoning

- Approved in [ADR-003](ADR-003-telephony-platform-decisions.md) — Multiple Carriers supported
- Carrier entity is tenant-scoped in the domain model
- Enables least-cost routing and regional carrier selection per tenant
- Complements interchangeable carriers decision

### Consequences

- A Tenant may have active carrier relationships with more than one carrier simultaneously
- Phone Numbers may be associated with different carriers within the same Tenant
- Carrier selection for outbound calls considers tenant carrier configuration (logic deferred)
- Per-tenant carrier inventory is managed through Carrier Adapter

---

## 9. Automatic Carrier Failover Supported

### Context

Carrier outages cause call failures. Enterprise-grade telephony requires automatic failover to alternate carrier paths without manual intervention.

### Decision

**Automatic carrier failover is supported.**

### Reasoning

- Approved in [ADR-003](ADR-003-telephony-platform-decisions.md) — Carrier failover supported
- Implements **High Availability** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Kamailio failover responsibility complements carrier-layer failover ([ADR-008](ADR-008-kamailio-architecture.md))
- Critical for outbound PSTN reliability

### Consequences

- Platform attempts alternate carrier paths when primary carrier is unavailable
- Failover triggers, scope, and recovery are deferred to implementation
- Failover applies within tenant carrier configuration
- Carrier Adapter reports carrier health for failover decisions (details deferred)

---

## 10. Carrier-Specific Settings Isolated from Business Logic

### Context

Each carrier has unique API credentials, trunk settings, webhook formats, and provisioning parameters. Embedding these in business entities couples domain logic to carrier implementations.

### Decision

**Carrier-specific settings are isolated from business logic.**

### Reasoning

- Approved in [ADR-006](ADR-006-database-design.md) — Store SIP and carrier configuration separately from business entities
- JSONB for provider-specific configuration applies to carrier settings
- Business entities (Phone Number, Line, Tenant) reference carriers without embedding carrier config
- Supports interchangeable carriers and BYOC

### Consequences

- Carrier credentials, trunk parameters, and API settings live in carrier configuration storage
- Business entities hold references to carrier resources, not carrier implementation details
- Carrier Adapter reads carrier-specific settings; business modules do not
- Provider-specific config format is isolated per Carrier Adapter implementation

---

## 11. Carrier Adapter Responsibilities

### Context

The Carrier Adapter is the single integration boundary for all carrier operations. Its responsibilities must be explicitly defined to prevent scope creep into business logic or Kamailio configuration.

### Decision

**The Carrier Adapter is responsible for:**

| Responsibility | Description |
|----------------|-------------|
| **Provision numbers** | Acquire and release phone numbers from carriers |
| **Manage trunks** | Configure and manage SIP trunks/interconnect |
| **Handle inbound events** | Process inbound carrier events (call arrival, status) |
| **Handle outbound calls** | Initiate and manage outbound carrier call setup |
| **Webhooks** | Receive and process carrier webhook callbacks |
| **Error translation** | Normalize carrier errors to platform error model |

### Reasoning

- Covers full carrier lifecycle from number provisioning through call handling
- Webhooks align with `webhook` module boundary for outbound platform notifications
- Error translation implements anti-corruption layer for carrier APIs
- Trunk management aligns with Kamailio carrier interconnect ([ADR-008](ADR-008-kamailio-architecture.md))

### Consequences

- `carrier` module implements Carrier Adapter interface and per-carrier adapters
- Business modules invoke Carrier Adapter for carrier operations, not carrier APIs
- Inbound carrier webhooks terminate at Carrier Adapter
- Normalized error codes are consumed by business logic and audit modules
- Specific API methods and webhook schemas per carrier are deferred to implementation

---

## 12. Summary

### Carriers

| Category | Carriers |
|----------|----------|
| Initial | Telnyx |
| Future | Bandwidth, Twilio, Plivo, Custom SIP Trunks |

### Architecture

```
Carrier Layer → Carrier Adapter → Routing Engine → Kamailio
```

### Rules

| Rule | Value |
|------|-------|
| Direct Telnyx access from business logic | Prohibited |
| Carrier communication path | Carrier Adapter only |
| Carrier interchangeability | Required |
| BYOC | Supported |
| Multiple carriers per Tenant | Supported |
| Automatic carrier failover | Supported |
| Carrier settings location | Isolated from business logic |

### Carrier Adapter Responsibilities

Provision numbers, Manage trunks, Handle inbound events, Handle outbound calls, Webhooks, Error translation

---

## 13. References

- [ADR-001: Overall System Architecture](ADR-001-overall-system-architecture.md)
- [ADR-003: Telephony Platform Decisions](ADR-003-telephony-platform-decisions.md)
- [ADR-006: Database Design](ADR-006-database-design.md)
- [ADR-008: Kamailio Architecture](ADR-008-kamailio-architecture.md)
- [Domain Model](../03-database/domain-model.md)
- [ADR Index](./README.md)
