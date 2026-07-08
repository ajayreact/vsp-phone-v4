# ADR-044: Provisioning Template & Artifact Store

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | Devices / Backend |
| **Informed** | Engineering |

---

## Overview

This ADR freezes **versioned templates, content-addressed artifacts, and promotion** for Grandstream configuration generation.

Aligns with [ADR-011](ADR-011-grandstream-provisioning.md), [TEL-PROV-001](../04-telecom/grandstream-provisioning-architecture.md), [ADR-042](ADR-042-provisioning-edge-url-scheme.md).

---

## Context

Enterprise fleets need controlled rollout and rollback of phone configuration without rewriting Device rows as config blobs.

---

## Decision

### 1. Template layers

```text
Platform base (model family)
  + Tenant overrides
  + Site overrides
  + Device/Line instance variables (incl. secret refs)
  → Rendered artifact
```

Templates are **immutable versions** (semver or monotonic id).

### 2. Artifact identity

```text
artifactHash = hash(mac, templateVer, lineVersion, secretsGen, brandingVer, ...)
```

Object key:

```text
prov/{tenantId}/gs/{mac}/{artifactHash}.xml
```

Provisioning edge may symlink/cache “current” → latest authorized hash for MAC.

### 3. Promotion pipeline

`draft → canary (Site or MAC cohort) → tenant stable → platform default`

Devices do not auto-jump to new template until reprovision policy / pin allows.

### 4. Rollback

Re-pin Tenant/Site/Device to prior `templateVer` → re-publish prior `artifactHash`. Do not rewrite `DeviceAssignment` history.

### 5. Storage

- Object storage (same platform OSS pattern as recordings, separate prefix/bucket).  
- Secrets injected at render from vault — **never** committed in git templates.

### 6. Ops metadata

Render jobs, last download, quarantine — **ops store** (Redis/object metadata/dedicated ops tables), not SIP runtime and not required Prisma redesign in Wave 1.

---

## Consequences

### Positive

- Deterministic rollback; multi-tenant isolation in keys.

### Negative

- Need render worker capacity at fleet scale.

---

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|-----------------|
| Per-device full cfg in PostgreSQL | Bloat; weak CDN story |
| Unversioned live templates | Unsafe fleet rollouts |

---

## References

- TEL-PROV-001 §5, §10  
- Sprint 5 phases: 17, 24  
