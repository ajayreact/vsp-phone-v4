# ADR-043: SIP Credential & Secret Storage

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | Security / Backend |
| **Informed** | Engineering |

---

## Overview

This ADR freezes **where SIP digest secrets, provisioning tokens, and carrier secrets live**, and what may appear in Prisma.

Aligns with [ADR-007](ADR-007-authentication-authorization.md), [ADR-011](ADR-011-grandstream-provisioning.md), [ADR-015](ADR-015-deployment-architecture.md), [TEL-PROV-001](../04-telecom/grandstream-provisioning-architecture.md).

---

## Context

SIP digest material and User JWT passwords must never be the same store. Prisma must not hold plaintext SIP passwords.

---

## Decision

### 1. Secrets Manager (vault) is authoritative

| Secret type | Storage |
|-------------|---------|
| SIP digest password / HA1 | Vault; keyed by `sipEndpointId` or `secretRef` |
| WebRTC enroll ephemeral secrets | Vault or short-TTL encrypted cache; expire with enroll |
| Provisioning HTTP MAC credentials | Vault |
| Device admin password (Grandstream P1) | Vault; injected at render |
| Telnyx API / SIP trunk secrets | Vault; Carrier config holds **reference id only** |

### 2. Prisma may store

- `SIPEndpoint.aor`, `authUsername`, registration **business** status fields, `registrationConfig` JSON for non-secret knobs.  
- **No** `sipPassword` / `ha1` columns on business models.

### 3. Auth verification path

NestJS `sip-digest` loads HA1/password from vault (or cache) → verifies response → returns allow ([ADR-024](ADR-024-kamailio-nestjs-api-contracts.md)). Kamailio may cache allow assertions briefly; TTL ≤ revoke window.

### 4. Rotation

1. Write new secret version to vault.  
2. Re-render provisioning / re-enroll WebRTC.  
3. Dual-accept grace optional ≤ short TTL.  
4. Revoke old version.

### 5. Logging

Never log Authorization digests, HA1, or provisioning tokens.

---

## Consequences

### Positive

- Aligns Security First; clear revoke story.

### Negative

- Vault availability affects REGISTER; mitigate with short auth cache + vault HA.

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| HA1 in PostgreSQL | Expands blast radius; backup exposure |
| Same as User.passwordHash | Violates ADR-007 plane split |

---

## References

- TEL-KAM-002 §5, TEL-PROV-001 §7  
- Sprint 5 phases: 8, 9, 12, 16–17, 23  
