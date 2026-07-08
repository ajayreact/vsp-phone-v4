# ADR-025: SIP Identity & Realm

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | Telecom Architecture |
| **Informed** | Engineering |

---

## Overview

This ADR freezes **AoR format, SIP realm, and identity binding** for desk phones and WebRTC clients registering to Kamailio.

Aligns with [ADR-007](ADR-007-authentication-authorization.md), [ADR-011](ADR-011-grandstream-provisioning.md), [ADR-012](ADR-012-webrtc-mobile-signaling.md), [TEL-KAM-002](../04-telecom/kamailio-telecom-integration-architecture.md), [TEL-WRTC-001](../04-telecom/webrtc-signaling-architecture.md).

---

## Context

Multi-tenant registrars require collision-free AoRs and a digest realm that maps to Tenant without trusting client-supplied tenant headers.

---

## Decision

### 1. Realm

| Item | Value |
|------|-------|
| Digest realm | `sip.vsp.internal` for platform-wide digest **or** per-tenant `{tenantSlug}.sip.vsp.example` if edge hosts multi-FQDN |
| Sprint 5 default | **Per-tenant SIP domain FQDN**: `{tenantSlug}.sip.<platform-domain>` as realm and Request-URI host for AoRs |
| Tenant bind | NestJS resolves Tenant from AoR host / realm; never from client `X-Tenant` alone |

### 2. AoR format

| Endpoint type | AoR |
|---------------|-----|
| Desk / SIP Device | `sip:{authUsername}@{tenantSipDomain}` |
| WebRTC Device | Same pattern; `authUsername` enroll-scoped, **not** User.email password |
| Extension dialing | Extension is **not** necessarily the AoR user part; NestJS maps Extension → Line → Devices → contacts |

`SIPEndpoint.aor` and `authUsername` in Prisma store the business identity strings; secrets stay in vault ([ADR-043](ADR-043-sip-credential-secret-storage.md)).

### 3. authUsername generation

- Opaque, tenant-unique string (e.g. `d_` + publicId fragment) — **not** reusable User login.
- Unique per `SIPEndpoint` within tenant (`@@unique([tenantId, aor])` already exists).

### 4. WebRTC enroll

- Enroll issues short-lived digest material for an existing WEBRTC `Device` / `SIPEndpoint` (or creates Device under Line).
- Enroll credentials ≠ JWT password ([ADR-007](ADR-007-authentication-authorization.md)).

### 5. Max contacts

Kamailio enforces max contacts per AoR (implementation knobs in cfg); NestJS may return policy `expiresSec`.

---

## Consequences

### Positive

- Clear tenant isolation at identity layer; softphone and desk share model.

### Negative

- Multi-FQDN TLS SANs / cert ops for per-tenant domains (or SNI).

### Neutral

- Extension numbers remain Telephony `Extension` entities, not AoR mandates.

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Global AoR `user@platform` without tenant host | Harder isolation / ACL |
| Extension-as-AoR only | Collides multi-device; user renumber pain |

---

## References

- TEL-KAM-002 §6, TEL-WRTC-001, TEL-PROV-001  
- Sprint 5 phases: 5, 8–9, 16–17  
