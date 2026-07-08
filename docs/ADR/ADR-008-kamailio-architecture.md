# ADR-008: Kamailio Architecture

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved Kamailio architecture** for VSP Phone v4. It defines Kamailio responsibilities, signaling ownership, routing flows, security controls, and availability requirements.

These decisions align with:

- [ADR-001](ADR-001-overall-system-architecture.md) — Kamailio, RTPengine, Telnyx, High Availability, Horizontally Scalable
- [ADR-003](ADR-003-telephony-platform-decisions.md) — Carrier interconnect, BYOC, failover, SIP registration expiry
- [ADR-007](ADR-007-authentication-authorization.md) — API auth separate from SIP auth
- [Kamailio Architecture](../04-telecom/kamailio-architecture.md) — Telecom documentation

This ADR does **not** define Kamailio configuration files, dialplan scripts, or implementation details.

---

## Table of Contents

### Kamailio Responsibilities

1. [Kamailio Responsibilities](#1-kamailio-responsibilities)

### Architecture

2. [Kamailio Owns SIP Signaling](#2-kamailio-owns-sip-signaling)
3. [NestJS Never Processes SIP Packets Directly](#3-nestjs-never-processes-sip-packets-directly)
4. [RTPengine Owns Media](#4-rtpengine-owns-media)
5. [Telnyx Connects Through Kamailio](#5-telnyx-connects-through-kamailio)
6. [Grandstream Phones Register to Kamailio](#6-grandstream-phones-register-to-kamailio)
7. [WebRTC Clients Register via Kamailio WebSocket](#7-webrtc-clients-register-via-kamailio-websocket)

### Routing

8. [Inbound Call Routing](#8-inbound-call-routing)
9. [Outbound Call Routing](#9-outbound-call-routing)

### Security

10. [TLS](#10-tls)
11. [Digest Authentication](#11-digest-authentication)
12. [SIP Rate Limiting](#12-sip-rate-limiting)
13. [Flood Protection](#13-flood-protection)
14. [IP Allow Lists for Carriers](#14-ip-allow-lists-for-carriers)
15. [Registration Expiration](#15-registration-expiration)

### Availability

16. [Stateless Routing Where Possible](#16-stateless-routing-where-possible)
17. [Horizontal Scaling](#17-horizontal-scaling)
18. [High Availability Cluster](#18-high-availability-cluster)

19. [Summary](#19-summary)
20. [References](#20-references)

---

## 1. Kamailio Responsibilities

### Context

VSP Phone v4 requires a dedicated SIP signaling layer to handle endpoint registration, call routing, carrier interconnect, and SIP security. These responsibilities must be owned by a single platform component to avoid fragmentation across the application and infrastructure layers.

### Decision

**Kamailio is responsible for the following:**

| Responsibility | Description |
|----------------|-------------|
| **SIP Registrar** | Maintain SIP endpoint registrations |
| **SIP Proxy** | Proxy SIP signaling between endpoints, platform, and carriers |
| **SIP Routing** | Route SIP requests to correct destinations |
| **Authentication** | Authenticate SIP endpoints and carrier connections |
| **Registration** | Handle SIP REGISTER requests and registration lifecycle |
| **NAT Traversal Coordination** | Coordinate NAT traversal with RTPengine |
| **Load Balancing** | Distribute SIP traffic across platform nodes |
| **Failover** | Failover for SIP signaling paths |
| **TLS Termination** | Terminate TLS for SIP signaling |
| **SIP Security** | Enforce SIP-layer security controls |

### Reasoning

- Consolidates all SIP signaling responsibilities in the approved SIP proxy ([ADR-001](ADR-001-overall-system-architecture.md))
- Aligns with `kamailio` and `sip` module boundaries in the application architecture
- Separates signaling from media (RTPengine) and application logic (NestJS)
- Matches infrastructure placement under `infrastructure/kamailio/`

### Consequences

- Kamailio is the single owner of SIP signaling operations listed above
- NestJS does not duplicate these responsibilities
- Operational expertise for SIP is concentrated on the Kamailio layer
- Configuration for these responsibilities resides in `infrastructure/kamailio/` (details deferred)

---

## 2. Kamailio Owns SIP Signaling

### Context

The platform has distinct layers for application logic, SIP signaling, and media. Signaling ownership must be unambiguous to prevent coupling and security gaps.

### Decision

**Kamailio owns SIP signaling.**

### Reasoning

- Approved signaling/media separation in [Call Architecture](../architecture/call-architecture.md) and [ADR-003](ADR-003-telephony-platform-decisions.md)
- Kamailio is the designated SIP proxy in the technology stack ([ADR-001](ADR-001-overall-system-architecture.md))
- Centralizes SIP dialog handling, routing, and security

### Consequences

- All SIP signaling flows traverse Kamailio
- SIP state and routing decisions originate at the Kamailio layer unless delegated to Routing Engine via integration
- Application services interact with Kamailio through integration boundaries, not direct SIP processing

---

## 3. NestJS Never Processes SIP Packets Directly

### Context

NestJS is the application orchestration layer. Processing raw SIP packets in the application would couple telephony protocol handling to business logic and undermine horizontal scaling of the SIP layer.

### Decision

**NestJS never processes SIP packets directly.**

### Reasoning

- Enforces separation between application layer (NestJS) and signaling layer (Kamailio)
- Aligns with Kamailio anti-corruption layer intent in domain-driven design
- Complements API authentication vs SIP authentication separation ([ADR-007](ADR-007-authentication-authorization.md))
- NestJS integrates with Kamailio via control interfaces, not SIP stack embedding

### Consequences

- No SIP stack or SIP packet parsing in NestJS application code
- `kamailio` and `sip` modules integrate through defined boundaries (protocol deferred)
- Call control commands flow from NestJS to Kamailio, not via direct SIP handling in NestJS

---

## 4. RTPengine Owns Media

### Context

Media (RTP/SRTP) handling requires different scaling, security, and operational characteristics than SIP signaling. Media ownership must remain with RTPengine.

### Decision

**RTPengine owns media.**

### Reasoning

- Approved signaling/media separation across platform architecture
- RTPengine is the designated media relay ([ADR-001](ADR-001-overall-system-architecture.md))
- Kamailio coordinates NAT traversal; RTPengine executes media relay
- Recording media is handled by RTPengine ([ADR-004](ADR-004-call-architecture.md))

### Consequences

- Kamailio does not terminate or relay RTP media
- Media path flows through RTPengine for all call types requiring media anchoring
- Kamailio invokes RTPengine for media session management (mechanism deferred)

---

## 5. Telnyx Connects Through Kamailio

### Context

Telnyx is the approved initial carrier for PSTN and SIP trunk interconnect. Carrier signaling must enter and exit the platform through the SIP proxy layer.

### Decision

**Telnyx connects through Kamailio.**

### Reasoning

- Telnyx is the approved carrier in the technology stack ([ADR-001](ADR-001-overall-system-architecture.md))
- Kamailio sits in the signaling path between platform and carrier ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Centralizes carrier SIP trunk security and routing at Kamailio
- Supports carrier failover at the signaling layer

### Consequences

- Inbound PSTN calls from Telnyx arrive at Kamailio
- Outbound PSTN calls to Telnyx depart from Kamailio
- Telnyx trunk configuration is managed at Kamailio/carrier integration layer (details deferred)
- Additional carriers also connect through Kamailio per Multiple Carriers support ([ADR-003](ADR-003-telephony-platform-decisions.md))

---

## 6. Grandstream Phones Register to Kamailio

### Context

Desk Phone call type is approved ([ADR-004](ADR-004-call-architecture.md)). Grandstream is a supported hardware SIP endpoint class for enterprise deployments.

### Decision

**Grandstream phones register to Kamailio.**

### Reasoning

- Desk Phone is an approved call type and Device endpoints register via SIP
- Kamailio is the SIP Registrar for endpoint registrations
- Grandstream phones use standard SIP REGISTER to Kamailio
- Aligns with Device module and SIP Endpoint domain entities

### Consequences

- Grandstream devices send SIP REGISTER to Kamailio
- Registration state contributes to Device state (Registered/Unregistered) ([ADR-004](ADR-004-call-architecture.md))
- Grandstream-specific provisioning is separate from SIP registration (details deferred)

---

## 7. WebRTC Clients Register via Kamailio WebSocket

### Context

WebRTC is an approved call type ([ADR-004](ADR-004-call-architecture.md)). WebRTC clients require SIP signaling transport compatible with browser environments.

### Decision

**WebRTC clients register through Kamailio over WebSocket.**

### Reasoning

- WebRTC clients cannot use traditional UDP/TCP SIP transports in browser environments
- Kamailio supports WebSocket as a SIP transport for WebRTC gateways
- Centralizes WebRTC SIP registration at the same registrar as hardware endpoints
- Aligns WebRTC with approved SIP signaling ownership

### Consequences

- WebRTC clients connect to Kamailio via WebSocket for SIP signaling
- WebRTC media may still flow through RTPengine (details deferred)
- WebRTC client authentication follows SIP authentication rules at Kamailio, separate from API JWT auth ([ADR-007](ADR-007-authentication-authorization.md))

---

## 8. Inbound Call Routing

### Context

Inbound calls from the carrier must be routed to the correct tenant destination — Line, Queue, IVR, Conference, or Voicemail ([ADR-003](ADR-003-telephony-platform-decisions.md)).

### Decision

**Inbound call routing follows this approved flow:**

```
Telnyx
  → Kamailio
  → Routing Engine
  → Destination
```

### Reasoning

- Telnyx connects through Kamailio (Decision 5)
- Kamailio receives inbound SIP and delegates routing decisions to Routing Engine
- Routing Engine resolves Phone Number to approved destination (Queue, IVR, Conference, Voicemail, Line)
- Separates SIP proxy duties from routing logic

### Consequences

- Kamailio does not make final routing decisions alone; Routing Engine determines destination
- Routing Engine integration point is between Kamailio and NestJS (protocol deferred)
- Inbound PSTN is an approved call type ([ADR-004](ADR-004-call-architecture.md))
- Destination types are limited to approved routing targets

---

## 9. Outbound Call Routing

### Context

Outbound calls from platform endpoints must traverse the SIP proxy and carrier adapter to reach Telnyx and the PSTN.

### Decision

**Outbound call routing follows this approved flow:**

```
Device
  → Kamailio
  → Carrier Adapter
  → Telnyx
```

### Reasoning

- Devices (Grandstream, WebRTC, SIP endpoints) send SIP INVITE to Kamailio
- Carrier Adapter applies carrier-specific logic before Telnyx interconnect
- Supports Multiple Carriers and BYOC ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Outbound PSTN is an approved call type ([ADR-004](ADR-004-call-architecture.md))

### Consequences

- All outbound SIP signaling from devices enters through Kamailio
- Carrier Adapter is the abstraction between Kamailio and carrier trunks (implementation deferred)
- Telnyx is the initial carrier path; additional carriers follow the same flow pattern
- Carrier failover applies at this outbound path ([ADR-003](ADR-003-telephony-platform-decisions.md))

---

## 10. TLS

### Context

SIP signaling over plaintext transport is vulnerable to interception and tampering. Enterprise deployments require encrypted signaling.

### Decision

**TLS is used for SIP signaling security.**

### Reasoning

- Implements SIP security responsibility of Kamailio
- Aligns with **Security First** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- TLS termination is an approved Kamailio responsibility
- Supports enterprise security and compliance requirements

### Consequences

- SIP signaling supports TLS transport
- Certificate management for SIP TLS is a Kamailio operational concern (details deferred)
- Relationship between Kamailio TLS termination and NGINX TLS is deferred to deployment ADRs

---

## 11. Digest Authentication

### Context

SIP endpoints and carrier connections must authenticate before registration and call setup. Digest authentication is the standard SIP authentication mechanism.

### Decision

**Digest Authentication is used for SIP authentication.**

### Reasoning

- Standard SIP authentication mechanism for endpoints and trunks
- Separates SIP credentials from platform API credentials ([ADR-007](ADR-007-authentication-authorization.md))
- Kamailio Authentication is an approved responsibility
- Aligns with SIP Registrar and Registration responsibilities

### Consequences

- SIP REGISTER and INVITE authentication use digest authentication
- SIP credentials are separate from platform User passwords
- Credential storage and validation mechanism are deferred to implementation
- Does not preclude TLS client certificate authentication in future ADRs

---

## 12. SIP Rate Limiting

### Context

SIP endpoints and carrier trunks can generate high request volumes. Uncontrolled SIP request rates risk platform stability and enable abuse.

### Decision

**SIP rate limiting is enforced at Kamailio.**

### Reasoning

- SIP security is an approved Kamailio responsibility
- Protects signaling layer from abuse and misconfigured endpoints
- Complements flood protection controls
- Aligns with carrier-grade platform reliability requirements

### Consequences

- Kamailio enforces per-source SIP request rate limits
- Rate limit thresholds and scope (per IP, per tenant, per trunk) are deferred
- Rate-limited requests are rejected at the SIP layer before reaching Routing Engine

---

## 13. Flood Protection

### Context

SIP flood attacks can overwhelm the signaling layer, causing denial of service for all tenants. Dedicated flood protection is required beyond basic rate limiting.

### Decision

**SIP flood protection is enforced at Kamailio.**

### Reasoning

- SIP security responsibility includes protection against volumetric SIP attacks
- Carrier-grade platforms are common targets for SIP flooding
- Complements SIP rate limiting with attack-pattern detection
- Protects Routing Engine and NestJS from SIP-layer floods

### Consequences

- Kamailio implements flood protection for SIP traffic
- Flood detection methods and thresholds are deferred to implementation
- Flooded sources are blocked at the Kamailio edge

---

## 14. IP Allow Lists for Carriers

### Context

Carrier SIP trunks (Telnyx and BYOC carriers) must be restricted to known source IP addresses to prevent unauthorized call injection and toll fraud.

### Decision

**IP allow lists are used for carrier SIP connections.**

### Reasoning

- Restricts carrier signaling to authorized source IPs
- Supports BYOC and Multiple Carriers with per-carrier IP controls ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Standard telecom security practice for SIP trunk interconnect
- Complements digest authentication for carrier connections

### Consequences

- Carrier SIP traffic is accepted only from allow-listed IP addresses
- Per-carrier allow lists are maintained for Telnyx and BYOC trunks
- Allow list management is a carrier provisioning concern (details deferred)

---

## 15. Registration Expiration

### Context

Stale SIP registrations from disconnected endpoints must not persist indefinitely. Registration expiry ensures accurate device reachability.

### Decision

**SIP registrations expire automatically.**

### Reasoning

- Approved in [ADR-003](ADR-003-telephony-platform-decisions.md) — SIP registrations expire automatically
- Kamailio Registration is an approved responsibility
- Prevents routing to unreachable endpoints
- Aligns with Device states Registered/Unregistered ([ADR-004](ADR-004-call-architecture.md))

### Consequences

- All SIP registrations have a finite lifetime
- Endpoints must refresh registrations before expiry
- Expired registrations are removed from Kamailio location service
- Registration expiry timers are deferred to configuration

---

## 16. Stateless Routing Where Possible

### Context

Stateful SIP dialog handling limits horizontal scaling and complicates failover. Stateless routing reduces inter-node coordination for certain SIP operations.

### Decision

**Kamailio uses stateless routing where possible.**

### Reasoning

- Supports horizontal scaling and High Availability goals
- Reduces shared state requirements across Kamailio nodes
- Aligns with **Horizontally Scalable** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Improves failover behavior for stateless SIP operations

### Consequences

- Kamailio routing design favors stateless processing where SIP semantics allow
- Stateful dialog handling is minimized to what SIP requires
- Which operations are stateless vs stateful is deferred to configuration design

---

## 17. Horizontal Scaling

### Context

Tenant and call volume growth requires the SIP signaling layer to scale horizontally without single-node bottlenecks.

### Decision

**Kamailio supports horizontal scaling.**

### Reasoning

- Implements **Horizontally Scalable** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Complements stateless routing where possible
- Load balancing is an approved Kamailio responsibility
- Required for carrier-grade multi-tenant scale

### Consequences

- Multiple Kamailio instances operate behind a load balancer
- SIP traffic is distributed across Kamailio nodes
- Shared state requirements for stateful operations are deferred to HA design
- Kubernetes-ready deployment supports Kamailio scaling ([ADR-001](ADR-001-overall-system-architecture.md))

---

## 18. High Availability Cluster

### Context

SIP signaling is critical path for all voice services. Kamailio node failure must not cause extended platform outage.

### Decision

**Kamailio operates as a High Availability cluster.**

### Reasoning

- Implements **High Availability** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Complements horizontal scaling and failover responsibilities
- Carrier failover at signaling layer requires resilient Kamailio deployment ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Enterprise customers expect telephony uptime guarantees

### Consequences

- Kamailio is deployed in an HA configuration, not as a single node
- Failover mechanisms apply within the Kamailio cluster
- HA topology (active/active, active/passive) is deferred to deployment ADRs
- RTPengine HA is a separate concern coordinated with Kamailio HA

---

## 19. Summary

### Kamailio Responsibilities

SIP Registrar, SIP Proxy, SIP Routing, Authentication, Registration, NAT Traversal Coordination, Load Balancing, Failover, TLS Termination, SIP Security

### Architecture

| Decision | Value |
|----------|-------|
| SIP signaling owner | Kamailio |
| NestJS SIP processing | Never direct |
| Media owner | RTPengine |
| Telnyx interconnect | Through Kamailio |
| Grandstream phones | Register to Kamailio |
| WebRTC clients | Register via Kamailio WebSocket |

### Routing

| Direction | Flow |
|-----------|------|
| Inbound | Telnyx → Kamailio → Routing Engine → Destination |
| Outbound | Device → Kamailio → Carrier Adapter → Telnyx |

### Security

TLS, Digest Authentication, SIP Rate Limiting, Flood Protection, IP Allow Lists for Carriers, Registration Expiration

### Availability

Stateless routing where possible, Horizontal Scaling, High Availability Cluster

---

## 20. References

- [ADR-001: Overall System Architecture](ADR-001-overall-system-architecture.md)
- [ADR-003: Telephony Platform Decisions](ADR-003-telephony-platform-decisions.md)
- [ADR-004: Call Architecture](ADR-004-call-architecture.md)
- [ADR-007: Authentication and Authorization](ADR-007-authentication-authorization.md)
- [Kamailio Architecture](../04-telecom/kamailio-architecture.md)
- [ADR Index](./README.md)
