# ADR-009: RTPengine Architecture

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved RTPengine architecture** for VSP Phone v4. It defines RTPengine responsibilities, control relationships, recording ownership, supported media types, security, and scalability requirements.

These decisions align with:

- [ADR-001](ADR-001-overall-system-architecture.md) — RTPengine in technology stack, Horizontally Scalable
- [ADR-004](ADR-004-call-architecture.md) — RTPengine records media; NestJS stores metadata only
- [ADR-008](ADR-008-kamailio-architecture.md) — Kamailio owns signaling; RTPengine owns media; Kamailio controls RTPengine

This ADR does **not** define RTPengine configuration files or implementation details.

---

## Table of Contents

### Responsibilities

1. [RTPengine Responsibilities](#1-rtpengine-responsibilities)

### Architecture

2. [Kamailio Controls RTPengine](#2-kamailio-controls-rtpengine)
3. [NestJS Never Processes RTP](#3-nestjs-never-processes-rtp)

### Recording

4. [RTPengine Records Media](#4-rtpengine-records-media)
5. [NestJS Stores Metadata Only](#5-nestjs-stores-metadata-only)

### Media Support

6. [Supported Media Types](#6-supported-media-types)

### Security

7. [SRTP](#7-srtp)
8. [DTLS](#8-dtls)
9. [Secure Media Relay](#9-secure-media-relay)

### Scalability

10. [Multiple RTPengine Instances](#10-multiple-rtpengine-instances)
11. [Horizontal Scaling](#11-horizontal-scaling)
12. [Independent Scaling from Kamailio](#12-independent-scaling-from-kamailio)

13. [Summary](#13-summary)
14. [References](#14-references)

---

## 1. RTPengine Responsibilities

### Context

VSP Phone v4 requires a dedicated media layer to relay RTP between endpoints, carriers, and the platform. Media handling involves NAT traversal, encryption, codec negotiation, and recording — distinct from SIP signaling handled by Kamailio.

### Decision

**RTPengine is responsible for the following:**

| Responsibility | Description |
|----------------|-------------|
| **RTP Proxy** | Proxy RTP media streams between parties |
| **Media Relay** | Relay media between endpoints and carrier interconnect |
| **SRTP** | Secure Real-time Transport Protocol handling |
| **ICE** | Interactive Connectivity Establishment for NAT and connectivity |
| **STUN** | Session Traversal Utilities for NAT |
| **TURN Integration** | Traversal Using Relays around NAT integration |
| **Recording** | Capture call media for recording |
| **NAT Traversal** | Traverse NAT for media paths |
| **Codec Negotiation** | Negotiate audio/video codecs for media sessions |

### Reasoning

- Consolidates all media-layer responsibilities in the approved media relay component ([ADR-001](ADR-001-overall-system-architecture.md))
- Aligns with `rtpengine` module boundary in the application architecture
- Separates media from SIP signaling (Kamailio) and application logic (NestJS)
- Supports approved call types including WebRTC, Mobile, SIP, and Desk Phones ([ADR-004](ADR-004-call-architecture.md))

### Consequences

- RTPengine is the single owner of media operations listed above
- NestJS does not duplicate media relay or RTP processing
- Media configuration resides in infrastructure scope (details deferred)
- Kamailio coordinates media sessions via RTPengine control interface

---

## 2. Kamailio Controls RTPengine

### Context

SIP signaling (Kamailio) and media relay (RTPengine) must be coordinated for call setup, teardown, and media anchoring. A clear control relationship prevents split ownership of session lifecycle.

### Decision

**Kamailio controls RTPengine.**

### Reasoning

- Kamailio owns SIP signaling and initiates media sessions on call setup ([ADR-008](ADR-008-kamailio-architecture.md))
- NAT traversal coordination is a Kamailio responsibility; RTPengine executes media relay
- Standard pattern: SIP proxy issues media commands to RTPengine on offer/answer
- NestJS does not control RTPengine directly for call media

### Consequences

- RTPengine session creation and teardown are triggered by Kamailio
- Kamailio invokes RTPengine for SDP offer/answer manipulation (mechanism deferred)
- NestJS may influence recording policy via Routing Engine but does not control RTP directly
- Control protocol between Kamailio and RTPengine is deferred to implementation

---

## 3. NestJS Never Processes RTP

### Context

NestJS is the application orchestration layer. Processing raw RTP media in the application would couple media handling to business logic and undermine media layer scaling.

### Decision

**NestJS never processes RTP.**

### Reasoning

- Enforces separation between application layer (NestJS) and media layer (RTPengine)
- Mirrors NestJS never processes SIP packets directly ([ADR-008](ADR-008-kamailio-architecture.md))
- Media relay requires different scaling and operational characteristics than application services
- Recording metadata is stored in NestJS; media files are not ([ADR-004](ADR-004-call-architecture.md))

### Consequences

- No RTP stack or media packet processing in NestJS application code
- `rtpengine` and `recording` modules store metadata and policies, not media streams
- Call recording files are produced and stored by RTPengine layer (storage deferred)

---

## 4. RTPengine Records Media

### Context

Call recording requires capture of live media streams. Recording must occur at the media layer where RTP flows are visible and can be duplicated.

### Decision

**RTPengine records media.**

### Reasoning

- Approved recording architecture in [ADR-004](ADR-004-call-architecture.md)
- Media recording requires access to RTP streams, which flow through RTPengine
- NestJS cannot record media without violating NestJS never processes RTP
- `call.recording.started` event signals recording; RTPengine performs capture

### Consequences

- Recording media files are produced by RTPengine
- Recording is triggered via Kamailio/RTPengine control path (details deferred)
- Recording operates under Line-owned Recording Policy in domain model
- Media file storage location and format are deferred to implementation

---

## 5. NestJS Stores Metadata Only

### Context

Call recordings require searchable metadata — Platform UUID, tenant, line, duration, timestamps — for admin UI, compliance, and billing. Storing media in the application database is inappropriate.

### Decision

**NestJS stores recording metadata only.**

### Reasoning

- Approved in [ADR-004](ADR-004-call-architecture.md) — NestJS stores metadata only
- Separates media storage from application data layer
- Metadata is tenant-scoped and queryable via PostgreSQL ([ADR-006](ADR-006-database-design.md))
- `recording` module owns metadata boundaries in application architecture

### Consequences

- NestJS `recording` module persists recording metadata, not media bytes
- Media files remain in RTPengine-controlled storage
- Metadata references Platform UUID and tenant context
- Link between metadata record and media file location is deferred to implementation

---

## 6. Supported Media Types

### Context

VSP Phone v4 supports multiple endpoint technologies, each with different media transport characteristics. The media layer must support all approved call and endpoint types.

### Decision

**RTPengine supports media for the following:**

| Media Type | Description |
|------------|-------------|
| **SIP** | Standard SIP endpoint media |
| **WebRTC** | Browser-based WebRTC media |
| **Mobile** | Mobile client media |
| **Desk Phones** | Hardware desk phone media (e.g., Grandstream) |

### Reasoning

- Aligns with approved call types: SIP, WebRTC, Mobile, Desk Phone ([ADR-004](ADR-004-call-architecture.md))
- WebRTC requires ICE, STUN, and DTLS support in RTPengine responsibilities
- Desk phones and SIP endpoints use RTP/SRTP through standard media relay
- Single media layer avoids duplicate media handling per endpoint type

### Consequences

- RTPengine handles media anchoring for all four endpoint classes
- WebRTC media enters through Kamailio WebSocket signaling and RTPengine media path
- Codec negotiation applies across all supported media types
- Per-type media configuration is deferred to implementation

---

## 7. SRTP

### Context

Media streams over plaintext RTP are vulnerable to interception. Enterprise deployments require encrypted media transport.

### Decision

**SRTP is supported for secure media transport.**

### Reasoning

- SRTP is an approved RTPengine responsibility
- Implements secure media requirements for enterprise UCaaS
- Aligns with **Security First** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Standard encryption for SIP desk phone and carrier media paths

### Consequences

- RTPengine terminates and re-encrypts SRTP as required for media relay
- SRTP key exchange follows SDP negotiation (details deferred)
- SRTP is required for carrier and enterprise endpoint media where supported

---

## 8. DTLS

### Context

WebRTC media requires DTLS for encryption and key exchange in browser environments. WebRTC is an approved call and media type.

### Decision

**DTLS is supported for WebRTC media security.**

### Reasoning

- WebRTC is an approved media type (Decision 6)
- DTLS is the standard WebRTC media encryption mechanism
- RTPengine WebRTC support requires DTLS handling
- Complements SRTP for non-WebRTC media paths

### Consequences

- RTPengine handles DTLS for WebRTC media sessions
- DTLS-SRTP is used for WebRTC media encryption
- DTLS certificate management is deferred to implementation

---

## 9. Secure Media Relay

### Context

Media relay between parties must maintain encryption end-to-end where required and prevent media exposure on the relay path. Secure relay is a platform security requirement.

### Decision

**RTPengine provides secure media relay.**

### Reasoning

- Combines SRTP, DTLS, and media relay responsibilities into a secure media path
- Implements **Security First** principle for the media layer
- Prevents plaintext media transit through the platform relay where encryption is negotiated
- Supports enterprise compliance requirements for voice media

### Consequences

- Media relay preserves negotiated encryption between endpoints where possible
- RTPengine does not decrypt media for relay unless required for recording or transcoding (policy deferred)
- Secure relay configuration is part of RTPengine deployment (details deferred)

---

## 10. Multiple RTPengine Instances

### Context

Media volume scales independently of SIP signaling volume. A single RTPengine instance creates a bottleneck and single point of failure for all tenant media.

### Decision

**Multiple RTPengine instances are deployed.**

### Reasoning

- Supports horizontal scaling of the media layer
- Required for carrier-grade call volume across many tenants
- Complements multiple Kamailio instances ([ADR-008](ADR-008-kamailio-architecture.md))
- Media workloads are CPU and bandwidth intensive; scaling requires multiple nodes

### Consequences

- Production deployment includes more than one RTPengine instance
- Kamailio selects or load-balances across RTPengine instances (mechanism deferred)
- Media session affinity may be required per call (details deferred)

---

## 11. Horizontal Scaling

### Context

Tenant and call volume growth requires the media layer to scale out horizontally without redesigning the architecture.

### Decision

**RTPengine supports horizontal scaling.**

### Reasoning

- Implements **Horizontally Scalable** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Complements multiple RTPengine instances decision
- Media layer must scale independently as call volume grows
- Kubernetes-ready deployment supports media node scaling

### Consequences

- RTPengine instances are added to increase media capacity
- Load distribution across instances is managed at deployment layer (details deferred)
- Scaling triggers and capacity planning are deferred to operations ADRs

---

## 12. Independent Scaling from Kamailio

### Context

SIP signaling and media relay have different resource profiles. Signaling is message-heavy; media is bandwidth and CPU-heavy. Coupling their scale creates inefficient resource allocation.

### Decision

**RTPengine scales independently from Kamailio.**

### Reasoning

- Signaling and media layers have different scaling characteristics
- Approved separation: Kamailio owns signaling, RTPengine owns media ([ADR-008](ADR-008-kamailio-architecture.md))
- Allows optimizing each layer for its workload independently
- Prevents over-provisioning Kamailio for media capacity or vice versa

### Consequences

- RTPengine instance count is not tied to Kamailio instance count
- Media capacity is planned and scaled separately from signaling capacity
- HA and failover for each layer are designed independently
- Coordination between scaled layers is via control interface only

---

## 13. Summary

### RTPengine Responsibilities

RTP Proxy, Media Relay, SRTP, ICE, STUN, TURN Integration, Recording, NAT Traversal, Codec Negotiation

### Architecture

| Decision | Value |
|----------|-------|
| Control | Kamailio controls RTPengine |
| NestJS RTP processing | Never |

### Recording

| Component | Responsibility |
|-----------|----------------|
| RTPengine | Records media |
| NestJS | Stores metadata only |

### Supported Media

SIP, WebRTC, Mobile, Desk Phones

### Security

SRTP, DTLS, Secure Media Relay

### Scalability

Multiple instances, Horizontal scaling, Independent scaling from Kamailio

---

## 14. References

- [ADR-001: Overall System Architecture](ADR-001-overall-system-architecture.md)
- [ADR-004: Call Architecture](ADR-004-call-architecture.md)
- [ADR-008: Kamailio Architecture](ADR-008-kamailio-architecture.md)
- [Call Architecture](../architecture/call-architecture.md)
- [ADR Index](./README.md)
