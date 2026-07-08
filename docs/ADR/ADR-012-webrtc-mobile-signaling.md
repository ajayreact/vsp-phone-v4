# ADR-012: WebRTC and Mobile Signaling

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved WebRTC and mobile client architecture** for VSP Phone v4. It defines supported clients, signaling and media flow, operational rules, layer ownership, and future capabilities.

These decisions align with:

- [ADR-004](ADR-004-call-architecture.md) — WebRTC and Mobile call types; presence states
- [ADR-008](ADR-008-kamailio-architecture.md) — WebRTC clients register via Kamailio WebSocket
- [ADR-009](ADR-009-rtpengine-architecture.md) — WebRTC media; ICE, STUN, TURN, SRTP, DTLS
- [ADR-003](ADR-003-telephony-platform-decisions.md) — Multiple devices per user; single identity
- [ADR-007](ADR-007-authentication-authorization.md) — API auth separate from SIP auth

This ADR does **not** define WebRTC code, mobile SDK implementation, or signaling configuration.

---

## Table of Contents

### Clients

1. [Supported Clients](#1-supported-clients)
2. [Desktop Client (Future)](#2-desktop-client-future)

### Architecture

3. [Client Architecture Flow](#3-client-architecture-flow)
4. [SIP over WebSocket](#4-sip-over-websocket)
5. [Secure WebSocket Only](#5-secure-websocket-only)
6. [SRTP Required](#6-srtp-required)
7. [ICE Required](#7-ice-required)
8. [STUN/TURN Supported](#8-stunturn-supported)
9. [Push Notifications for Mobile](#9-push-notifications-for-mobile)
10. [Presence Synchronization](#10-presence-synchronization)
11. [Device Registration](#11-device-registration)
12. [Multiple Devices per User](#12-multiple-devices-per-user)

### Media and Layer Ownership

13. [RTPengine Owns Media](#13-rtpengine-owns-media)
14. [NestJS Owns Business Logic](#14-nestjs-owns-business-logic)
15. [Kamailio Owns Signaling](#15-kamailio-owns-signaling)

### Future

16. [Future Capabilities](#16-future-capabilities)

17. [Summary](#17-summary)
18. [References](#18-references)

---

## 1. Supported Clients

### Context

VSP Phone v4 must support softphone clients across browser and mobile platforms. Approved client types define the scope of WebRTC and mobile signaling architecture.

### Decision

The following **clients are approved**:

| Client | Status |
|--------|--------|
| **Browser** | Approved |
| **iOS** | Approved |
| **Android** | Approved |
| **Desktop** | Future |

### Reasoning

- WebRTC and Mobile are approved call types ([ADR-004](ADR-004-call-architecture.md))
- Browser uses WebRTC over WebSocket through Kamailio ([ADR-008](ADR-008-kamailio-architecture.md))
- iOS and Android extend platform reach for mobile workforce
- Desktop native client is planned but deferred

### Consequences

- Initial WebRTC/mobile implementation targets Browser, iOS, and Android
- Each client type connects via approved signaling and media architecture
- Desktop client follows same architectural pattern when implemented
- Client-specific SDK details are deferred to implementation

---

## 2. Desktop Client (Future)

### Context

A native desktop softphone may be required for users who prefer a dedicated application over browser-based calling.

### Decision

**Desktop client support is approved for future implementation.**

### Reasoning

- Completes client coverage alongside Browser, iOS, and Android
- Desktop client would use the same SIP over WebSocket and RTPengine media path
- Implementation explicitly deferred to a future phase
- Architecture must not preclude native desktop clients

### Consequences

- Desktop is not in initial client delivery scope
- Future desktop client follows Browser → WSS → Kamailio → RTPengine → NestJS flow
- Desktop-specific packaging and distribution are deferred

---

## 3. Client Architecture Flow

### Context

WebRTC and mobile clients traverse signaling, media, and application layers. A clear end-to-end flow defines integration boundaries for each component.

### Decision

**The approved client architecture flow is:**

```
Browser / Mobile Client
        ↓
Secure WebSocket (WSS)
        ↓
Kamailio
        ↓
RTPengine
        ↓
NestJS
```

### Reasoning

- WebRTC clients cannot use traditional UDP/TCP SIP; WSS is the browser transport ([ADR-008](ADR-008-kamailio-architecture.md))
- Kamailio owns SIP signaling; RTPengine owns media ([ADR-009](ADR-009-rtpengine-architecture.md))
- NestJS owns business logic; does not process SIP or RTP directly
- Aligns with approved layer separation across platform architecture

### Consequences

- All WebRTC/mobile clients connect to Kamailio via WSS for signaling
- Media flows through RTPengine for all client types
- NestJS receives business events and provides application integration, not raw SIP/RTP
- Control integration between Kamailio and NestJS is deferred to implementation

---

## 4. SIP over WebSocket

### Context

WebRTC clients in browsers and mobile apps require a SIP transport compatible with constrained network environments and browser security models.

### Decision

**SIP signaling uses SIP over WebSocket.**

### Reasoning

- Standard approach for WebRTC softphones in browser environments
- Kamailio supports WebSocket as SIP transport ([ADR-008](ADR-008-kamailio-architecture.md))
- Unifies WebRTC client signaling with platform SIP infrastructure
- iOS and Android clients use the same SIP-over-WebSocket path as Browser

### Consequences

- Clients send SIP REGISTER, INVITE, and related messages over WebSocket
- Kamailio terminates WebSocket SIP connections
- SIP over WebSocket is distinct from API REST/WebSocket used by NestJS admin
- WebSocket SIP port and path configuration are deferred

---

## 5. Secure WebSocket Only

### Context

SIP credentials and call signaling over plaintext WebSocket are vulnerable to interception. Enterprise deployments require encrypted signaling transport.

### Decision

**Secure WebSocket (WSS) only — plaintext WebSocket is not permitted.**

### Reasoning

- Implements secure client connectivity requirement
- Aligns with **Security First** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Complements SRTP requirement for media encryption
- Standard enterprise security baseline for WebRTC clients

### Consequences

- Clients connect to Kamailio via `wss://` only
- Plaintext `ws://` connections are rejected
- TLS certificate management for WSS is a Kamailio operational concern (deferred)
- Relationship between WSS on Kamailio and NGINX TLS termination is deferred

---

## 6. SRTP Required

### Context

Media streams must be encrypted in transit. WebRTC and mobile clients require secure media transport for enterprise compliance.

### Decision

**SRTP is required for media.**

### Reasoning

- Approved RTPengine responsibility ([ADR-009](ADR-009-rtpengine-architecture.md))
- WebRTC media type support includes SRTP ([ADR-009](ADR-009-rtpengine-architecture.md))
- Complements DTLS for WebRTC and secure media relay decisions
- Enterprise UCaaS security baseline

### Consequences

- Media sessions negotiate SRTP; plaintext RTP is not permitted for client media
- RTPengine handles SRTP termination and relay
- SRTP key exchange follows SDP negotiation (details deferred)
- Applies to Browser, iOS, Android, and future Desktop clients

---

## 7. ICE Required

### Context

WebRTC and mobile clients operate behind NATs and firewalls. Interactive Connectivity Establishment is required to establish media paths.

### Decision

**ICE is required for client media connectivity.**

### Reasoning

- Approved RTPengine responsibility — ICE ([ADR-009](ADR-009-rtpengine-architecture.md))
- WebRTC standard requires ICE for NAT traversal
- Mobile clients on cellular and Wi-Fi networks require ICE for reliable media
- Complements STUN/TURN support

### Consequences

- Client and RTPengine perform ICE negotiation for all media sessions
- ICE candidates are exchanged via SDP through Kamailio signaling path
- ICE failure results in media setup failure (handling deferred)
- ICE configuration is part of RTPengine and client setup (details deferred)

---

## 8. STUN/TURN Supported

### Context

ICE requires STUN for NAT discovery and TURN for relay when direct connectivity fails. Mobile and browser clients frequently require TURN in restrictive network environments.

### Decision

**STUN and TURN are supported.**

### Reasoning

- Approved RTPengine responsibilities — STUN, TURN integration ([ADR-009](ADR-009-rtpengine-architecture.md))
- Required for reliable WebRTC and mobile media in enterprise networks
- TURN provides media relay fallback when direct peer-to-peer paths fail
- Complements ICE required decision

### Consequences

- Clients receive STUN/TURN server configuration as part of provisioning/signaling
- RTPengine integrates TURN for media relay scenarios
- STUN/TURN server deployment and credentials are deferred to implementation
- TURN usage may incur additional media path latency (operational consideration)

---

## 9. Push Notifications for Mobile

### Context

iOS and Android clients are suspended in background state and cannot maintain persistent SIP registration without push notification wake-up.

### Decision

**Push notifications are used for mobile clients.**

### Reasoning

- Mobile platforms require push to deliver incoming call alerts when app is backgrounded
- Standard pattern for mobile VoIP applications on iOS and Android
- Complements device registration and SIP registration expiry ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Enables reliable inbound call delivery to mobile clients

### Consequences

- iOS uses APNS; Android uses FCM or equivalent (details deferred)
- Push notifications wake mobile client for incoming call setup
- `notification` module boundary handles push delivery
- Push token registration is part of mobile device registration (details deferred)

---

## 10. Presence Synchronization

### Context

Presence states (Available, Busy, On Call, Away, DND, Offline) must be consistent across Browser, mobile, and desk phone clients for a given User/Line.

### Decision

**Presence synchronization is supported across clients.**

### Reasoning

- Approved presence states in [ADR-004](ADR-004-call-architecture.md)
- Line-owned Presence in domain model must reflect across all user devices
- Users with multiple devices require consistent presence view
- Supports call delivery and queue agent availability decisions

### Consequences

- Presence changes on one client propagate to platform and other clients
- Presence source of truth and sync mechanism are deferred to implementation
- Presence sync is distinct from SIP registration state
- Real-time presence delivery may use WebSocket or push (deferred)

---

## 11. Device Registration

### Context

WebRTC and mobile clients must register as platform Devices to participate in call delivery, Line assignment, and tenant-scoped operations.

### Decision

**WebRTC and mobile clients undergo device registration.**

### Reasoning

- Device is a tenant-scoped entity in the domain model
- Device registration contributes to Device states (Registered, Online, etc.) ([ADR-004](ADR-004-call-architecture.md))
- SIP REGISTER to Kamailio follows device registration in application layer
- Separates platform device identity from SIP signaling credentials

### Consequences

- Browser and mobile clients create Device records within Tenant scope
- Device registration precedes or accompanies SIP registration to Kamailio
- Device is assigned to a Line per [ADR-011](ADR-011-grandstream-provisioning.md) rules (one Line at a time)
- Registration flow details per client type are deferred

---

## 12. Multiple Devices per User

### Context

Users commonly operate a browser softphone, mobile app, and desk phone simultaneously. The platform must support multiple registered clients per user.

### Decision

**Multiple devices per user are supported.**

### Reasoning

- Approved in [ADR-003](ADR-003-telephony-platform-decisions.md) — Users may have multiple Devices
- One Line may ring multiple Devices ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Browser + iOS + Android + Desk Phone is a common enterprise configuration
- Single identity across devices via Line ([ADR-003](ADR-003-telephony-platform-decisions.md))

### Consequences

- A User may have Browser, iOS, Android, and Desk Phone registered simultaneously
- Line ringing targets all assigned Devices including WebRTC/mobile clients
- Each client is a separate Device record with independent SIP registration
- Device-based sessions apply per client ([ADR-007](ADR-007-authentication-authorization.md))

---

## 13. RTPengine Owns Media

### Context

Media layer ownership must remain with RTPengine for all client types including WebRTC and mobile.

### Decision

**RTPengine owns media for WebRTC and mobile clients.**

### Reasoning

- Approved in [ADR-009](ADR-009-rtpengine-architecture.md) — RTPengine owns media
- WebRTC and Mobile are approved RTPengine media types ([ADR-009](ADR-009-rtpengine-architecture.md))
- NestJS never processes RTP ([ADR-009](ADR-009-rtpengine-architecture.md))
- DTLS and ICE handled at RTPengine for WebRTC

### Consequences

- Browser, iOS, and Android media flows through RTPengine
- Clients do not establish direct media paths bypassing RTPengine for platform calls
- Media recording for WebRTC/mobile calls is via RTPengine ([ADR-004](ADR-004-call-architecture.md))

---

## 14. NestJS Owns Business Logic

### Context

Application orchestration — call control commands, tenant context, Line assignment, event publishing — belongs in the NestJS application layer, not in Kamailio or RTPengine.

### Decision

**NestJS owns business logic for WebRTC and mobile clients.**

### Reasoning

- NestJS is the approved application framework ([ADR-001](ADR-001-overall-system-architecture.md))
- Kamailio and RTPengine handle protocol layers only
- Call events (`call.created`, `call.answered`, etc.) originate from NestJS domain ([ADR-004](ADR-004-call-architecture.md))
- API authentication for admin and client app uses JWT separate from SIP ([ADR-007](ADR-007-authentication-authorization.md))

### Consequences

- Client apps call NestJS APIs for business operations (provisioning, directory, settings)
- NestJS does not terminate SIP or RTP for WebRTC/mobile clients
- Integration between client app API layer and Kamailio signaling is via NestJS orchestration (deferred)

---

## 15. Kamailio Owns Signaling

### Context

All SIP signaling for WebRTC and mobile clients must traverse Kamailio, consistent with desk phone and carrier signaling architecture.

### Decision

**Kamailio owns signaling for WebRTC and mobile clients.**

### Reasoning

- Kamailio owns SIP signaling platform-wide ([ADR-008](ADR-008-kamailio-architecture.md))
- WebRTC clients register through Kamailio over WebSocket ([ADR-008](ADR-008-kamailio-architecture.md))
- Unified signaling layer for all endpoint types
- NestJS never processes SIP packets directly ([ADR-008](ADR-008-kamailio-architecture.md))

### Consequences

- Browser, iOS, and Android send all SIP signaling to Kamailio via WSS
- Kamailio routes WebRTC/mobile calls using same routing architecture as other endpoints
- SIP digest authentication for clients is at Kamailio, separate from API JWT

---

## 16. Future Capabilities

### Context

Advanced real-time communication features extend beyond initial voice-only WebRTC and mobile scope.

### Decision

The following capabilities are approved for **future support**:

| Capability | Description |
|------------|-------------|
| **Screen sharing** | Share screen during calls |
| **Video** | Video calling |
| **AI transcription** | AI-powered call transcription |
| **Live captions** | Real-time caption display during calls |

### Reasoning

- Competitive UCaaS platforms offer video, screen share, and AI-assisted features
- Architecture must not preclude media type expansion at RTPengine
- AI transcription and live captions align with recording and audit capabilities
- Implementation explicitly deferred to future phases

### Consequences

- Initial WebRTC/mobile scope is voice-centric
- RTPengine and client architecture accommodate future video media types
- AI transcription integrates with `recording` and Platform Services (deferred)
- Each future capability requires a dedicated implementation ADR when prioritized

---

## 17. Summary

### Clients

Browser, iOS, Android (approved); Desktop (future)

### Architecture Flow

```
Client → WSS → Kamailio → RTPengine → NestJS
```

### Rules

| Rule | Value |
|------|-------|
| Signaling transport | SIP over WebSocket |
| WebSocket security | WSS only |
| Media encryption | SRTP required |
| NAT traversal | ICE required |
| STUN/TURN | Supported |
| Mobile inbound calls | Push notifications |
| Presence | Synchronized across clients |
| Registration | Device registration required |
| Devices per user | Multiple supported |

### Layer Ownership

| Layer | Owner |
|-------|-------|
| Signaling | Kamailio |
| Media | RTPengine |
| Business logic | NestJS |

### Future

Screen sharing, Video, AI transcription, Live captions

---

## 18. References

- [ADR-003: Telephony Platform Decisions](ADR-003-telephony-platform-decisions.md)
- [ADR-004: Call Architecture](ADR-004-call-architecture.md)
- [ADR-007: Authentication and Authorization](ADR-007-authentication-authorization.md)
- [ADR-008: Kamailio Architecture](ADR-008-kamailio-architecture.md)
- [ADR-009: RTPengine Architecture](ADR-009-rtpengine-architecture.md)
- [ADR-011: Grandstream Provisioning](ADR-011-grandstream-provisioning.md)
- [ADR Index](./README.md)
