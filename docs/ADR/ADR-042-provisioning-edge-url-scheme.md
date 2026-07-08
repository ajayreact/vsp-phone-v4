# ADR-042: Provisioning Edge & URL Scheme

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | Devices / Security |
| **Informed** | Engineering |

---

## Overview

This ADR freezes the **HTTPS provisioning edge URL scheme and device authentication pattern** for Grandstream GRP/GXP zero-touch/staged provisioning.

Aligns with [ADR-011](ADR-011-grandstream-provisioning.md), [TEL-PROV-001](../04-telecom/grandstream-provisioning-architecture.md).

---

## Context

Phones need a deterministic Config Server Path. URLs must support MAC auth, tenant isolation, and quarantine of unknown MACs — not security-by-obscurity alone.

---

## Decision

### 1. Hostname

`https://prov.<platform-domain>/` — TLS required; Validate Server Certificates enabled on devices in production profiles.

### 2. Config URL scheme (normative)

```text
GET https://prov.<platform-domain>/gs/{mac}/cfg.xml
```

- `{mac}` = lowercase 12 hex digits, no separators (e.g. `000b820a1234`).  
- Optional content-negotiated aliases may exist; **canonical** path above.  
- RPS / DHCP Option maps to `prov.<platform-domain>` (path or full URL per distributor capability).

### 3. Firmware URL scheme

```text
GET https://prov.<platform-domain>/fw/{modelFamily}/{version}/{filename}
```

Catalog-approved versions only ([TEL-PROV-001](../04-telecom/grandstream-provisioning-architecture.md)).

### 4. Device authentication

| Control | Required |
|---------|----------|
| TLS | Yes |
| Per-device HTTP credentials or MAC-bound bearer token | Yes (issued at enroll) |
| Unknown MAC | **404/401 quarantine** — never return another tenant’s cfg |
| Rate limit | Per MAC + per source IP |

Exact header layout (Basic vs custom token) may be refined in OpenAPI; decision: **credentials are mandatory**.

### 5. Separation

Provisioning edge does **not** speak SIP and does not write CallSession. NestJS orchestrates render; edge serves artifacts ([ADR-044](ADR-044-provisioning-template-artifact-store.md)).

---

## Consequences

### Positive

- Uniform Grandstream Config Server Path; clear quarantine posture.

### Negative

- RPS provider setup is operational work per fleet.

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| TFTP/HTTP cleartext | Violates ADR-011 HTTPS-only |
| Open MAC→cfg without auth | Tenant takeover risk |

---

## References

- TEL-PROV-001 §4–8  
- Sprint 5 phases: 2, 17, 23  
