# Architecture Decision Records (ADR)

Architecture Decision Records capture significant technical and architectural decisions for VSP Phone v4, along with their context, consequences, and status.

---

## Table of Contents

1. [Purpose](#purpose)
2. [When to Write an ADR](#when-to-write-an-adr)
3. [ADR Index](#adr-index)
4. [File Naming Convention](#file-naming-convention)
5. [ADR Template](#adr-template)
6. [Status Definitions](#status-definitions)
7. [Review Process](#review-process)
8. [Related Documents](#related-documents)

---

## Purpose

<!-- To be completed during the architecture phase -->

_TBD_

---

## When to Write an ADR

<!-- To be completed during the architecture phase -->

Write an ADR when a decision:

- TBD
- TBD
- TBD

---

## ADR Index

<!-- To be completed during the architecture phase -->

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](ADR-001-overall-system-architecture.md) | Overall System Architecture | Accepted | 2026-07-08 |
| [ADR-002](ADR-002-tenant-domain-model.md) | Tenant Domain Model | Accepted | 2026-07-08 |
| [ADR-003](ADR-003-telephony-platform-decisions.md) | Telephony Platform Decisions | Accepted | 2026-07-08 |
| [ADR-004](ADR-004-call-architecture.md) | Call Architecture | Accepted | 2026-07-08 |
| [ADR-006](ADR-006-database-design.md) | Database Design | Accepted | 2026-07-08 |
| [ADR-007](ADR-007-authentication-authorization.md) | Authentication and Authorization | Accepted | 2026-07-08 |
| [ADR-008](ADR-008-kamailio-architecture.md) | Kamailio Architecture | Accepted | 2026-07-08 |
| [ADR-009](ADR-009-rtpengine-architecture.md) | RTPengine Architecture | Accepted | 2026-07-08 |
| [ADR-010](ADR-010-carrier-abstraction.md) | Carrier Abstraction | Accepted | 2026-07-08 |
| [ADR-011](ADR-011-grandstream-provisioning.md) | Grandstream Provisioning | Accepted | 2026-07-08 |
| [ADR-012](ADR-012-webrtc-mobile-signaling.md) | WebRTC and Mobile Signaling | Accepted | 2026-07-08 |
| [ADR-013](ADR-013-api-standards.md) | API Standards | Accepted | 2026-07-08 |
| [ADR-014](ADR-014-event-driven-architecture.md) | Event-Driven Architecture | Accepted | 2026-07-08 |
| [ADR-015](ADR-015-deployment-architecture.md) | Deployment Architecture | Accepted | 2026-07-08 |
| [ADR-016](ADR-016-monitoring-observability.md) | Monitoring and Observability | Accepted | 2026-07-08 |
| [ADR-017](ADR-017-disaster-recovery.md) | Disaster Recovery | Accepted | 2026-07-08 |
| [ADR-019](ADR-019-telecom-correlation.md) | Telecom Correlation (`platformUuid`) | Accepted | 2026-07-08 |
| [ADR-021](ADR-021-inbound-dnis-routing.md) | Inbound DNIS Routing | Accepted | 2026-07-08 |
| [ADR-024](ADR-024-kamailio-nestjs-api-contracts.md) | Kamailio ↔ NestJS API Contracts | Accepted | 2026-07-08 |
| [ADR-025](ADR-025-sip-identity-realm.md) | SIP Identity & Realm | Accepted | 2026-07-08 |
| [ADR-029](ADR-029-recording-capture-object-keys.md) | Recording Capture & Object Keys | Accepted | 2026-07-08 |
| [ADR-038](ADR-038-browser-softphone-client-stack.md) | Browser Softphone Client Stack | Accepted | 2026-07-08 |
| [ADR-039](ADR-039-sip-over-wss-outbound-profile.md) | SIP over WSS & Outbound Profile | Accepted | 2026-07-08 |
| [ADR-042](ADR-042-provisioning-edge-url-scheme.md) | Provisioning Edge & URL Scheme | Accepted | 2026-07-08 |
| [ADR-043](ADR-043-sip-credential-secret-storage.md) | SIP Credential & Secret Storage | Accepted | 2026-07-08 |
| [ADR-044](ADR-044-provisioning-template-artifact-store.md) | Provisioning Template & Artifact Store | Accepted | 2026-07-08 |

---

## File Naming Convention

```
NNNN-short-descriptive-title.md
```

Examples:

- `0001-monorepo-structure.md`
- `0002-multi-tenancy-model.md`
- `0003-database-technology-selection.md`

---

## ADR Template

Use the following template for all new ADRs:

```markdown
# ADR-NNNN: [Title]

| Field | Value |
|-------|-------|
| **Status** | Proposed / Accepted / Deprecated / Superseded |
| **Date** | YYYY-MM-DD |
| **Deciders** | TBD |
| **Consulted** | TBD |
| **Informed** | TBD |

## Context

<!-- What is the issue that we're seeing that is motivating this decision? -->

_TBD_

## Decision

<!-- What is the change that we're proposing and/or doing? -->

_TBD_

## Consequences

<!-- What becomes easier or more difficult to do because of this change? -->

### Positive

_TBD_

### Negative

_TBD_

### Neutral

_TBD_

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|-------------|------|------|-----------------|
| TBD | TBD | TBD | TBD |

## References

- TBD
```

---

## Status Definitions

<!-- To be completed during the architecture phase -->

| Status | Description |
|--------|-------------|
| Proposed | Under discussion; not yet approved |
| Accepted | Approved and in effect |
| Deprecated | No longer recommended; may still be in use |
| Superseded | Replaced by a newer ADR |

---

## Review Process

<!-- To be completed during the architecture phase -->

1. TBD
2. TBD
3. TBD

---

## Related Documents

| Document | Location |
|----------|----------|
| Software Architecture Document | [../02-architecture/Software-Architecture-Document.md](../02-architecture/Software-Architecture-Document.md) |
| Architecture Principles | [../02-architecture/Architecture-Principles.md](../02-architecture/Architecture-Principles.md) |
| High-Level Architecture | [../02-architecture/High-Level-Architecture.md](../02-architecture/High-Level-Architecture.md) |
