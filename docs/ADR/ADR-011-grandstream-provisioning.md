# ADR-011: Grandstream Provisioning

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved Grandstream provisioning architecture** for VSP Phone v4. It defines supported devices, provisioning flow, service responsibilities, operational rules, and future capabilities.

These decisions align with:

- [ADR-002](ADR-002-tenant-domain-model.md) — Device belongs to Tenant; Device reassignment; Line assignment
- [ADR-003](ADR-003-telephony-platform-decisions.md) — Devices belong to one Tenant; reassignment to Users over time
- [ADR-008](ADR-008-kamailio-architecture.md) — Grandstream phones register to Kamailio
- [ADR-004](ADR-004-call-architecture.md) — Desk Phone call type; Device states including Provisioning
- [Domain Model](../03-database/domain-model.md) — Device, Line, Tenant, `provisioning` module

This ADR does **not** define provisioning code, configuration files, or implementation details.

---

## Table of Contents

1. [Supported Devices](#1-supported-devices)
2. [Future Vendor Support](#2-future-vendor-support)
3. [Provisioning Architecture Flow](#3-provisioning-architecture-flow)
4. [Provisioning Service Responsibilities](#4-provisioning-service-responsibilities)
5. [Every Device Belongs to One Tenant](#5-every-device-belongs-to-one-tenant)
6. [Every Device Assigned to One Line at a Time](#6-every-device-assigned-to-one-line-at-a-time)
7. [Devices May Be Reassigned](#7-devices-may-be-reassigned)
8. [Provisioning Templates Are Versioned](#8-provisioning-templates-are-versioned)
9. [Tenant Branding Supported](#9-tenant-branding-supported)
10. [Secure Provisioning Using HTTPS](#10-secure-provisioning-using-https)
11. [MAC Addresses Are Unique](#11-mac-addresses-are-unique)
12. [Future Support](#12-future-support)
13. [Summary](#13-summary)
14. [References](#14-references)

---

## 1. Supported Devices

### Context

VSP Phone v4 targets enterprise desk phone deployments. Grandstream is the initial hardware vendor for approved Desk Phone call type. Device support must be explicitly defined for provisioning templates and configuration generation.

### Decision

The following **Grandstream device families are approved** for provisioning:

| Family | Description |
|--------|-------------|
| **Grandstream GRP Series** | Grandstream GRP desk phones |
| **Grandstream GXP Series** | Grandstream GXP desk phones |

### Reasoning

- Grandstream phones register to Kamailio ([ADR-008](ADR-008-kamailio-architecture.md))
- Desk Phone is an approved call type ([ADR-004](ADR-004-call-architecture.md))
- GRP and GXP are common enterprise Grandstream product lines
- Initial provisioning scope focuses on proven Grandstream deployment patterns

### Consequences

- Provisioning templates and configuration generators target GRP and GXP series initially
- Device model detection drives template selection during auto-discovery
- Additional Grandstream models within these families are supported via template extension (details deferred)
- Non-Grandstream devices are not provisioned until future vendor support is implemented

---

## 2. Future Vendor Support

### Context

Enterprise customers use multiple desk phone vendors. The provisioning architecture must accommodate expansion beyond Grandstream without redesigning the provisioning flow.

### Decision

**Future vendor support is approved for:**

| Vendor | Status |
|--------|--------|
| **Yealink** | Future |
| **Fanvil** | Future |
| **Poly** | Future |

### Reasoning

- Enterprise UCaaS platforms commonly support multiple hardware vendors
- Provisioning architecture (Service → Generator → Server) is vendor-agnostic by design
- Template-based provisioning accommodates vendor-specific configuration formats
- Implementation is explicitly deferred to future phases

### Consequences

- Provisioning Service and Configuration Generator are designed for multi-vendor extension
- Each vendor receives vendor-specific configuration templates (deferred)
- Grandstream is the initial implementation target only
- Vendor addition requires configuration generator extension, not architecture change

---

## 3. Provisioning Architecture Flow

### Context

Device provisioning spans discovery, configuration generation, secure delivery, and device application. A clear vertical flow prevents coupling between business logic and device-specific protocols.

### Decision

**The approved provisioning architecture flow is:**

```
Phone
  ↓
Provisioning Service
  ↓
Configuration Generator
  ↓
Provisioning Server
  ↓
Device
```

### Reasoning

- Separates orchestration (Provisioning Service) from config production (Configuration Generator) and delivery (Provisioning Server)
- Aligns with `provisioning` module boundary in application architecture
- Phone initiates provisioning; platform responds with generated configuration
- Device receives and applies configuration from Provisioning Server

### Consequences

- Business logic invokes Provisioning Service; not Configuration Generator or Provisioning Server directly
- Configuration Generator produces vendor-specific config from templates
- Provisioning Server hosts and delivers configuration to devices over HTTPS
- Integration points between components are deferred to implementation

---

## 4. Provisioning Service Responsibilities

### Context

The provisioning layer must support the full device lifecycle from first boot through firmware updates and remote reconfiguration. Responsibilities must be explicitly defined.

### Decision

**The provisioning architecture is responsible for:**

| Responsibility | Description |
|----------------|-------------|
| **Zero-touch provisioning** | Devices provision automatically without manual configuration |
| **Auto-discovery** | Detect and identify devices requesting provisioning |
| **Configuration generation** | Produce device-specific configuration from templates |
| **Firmware management** | Manage device firmware versions and updates |
| **Template-based provisioning** | Generate configuration from versioned templates |
| **Secure device authentication** | Authenticate devices during provisioning |
| **Configuration versioning** | Track configuration versions applied to devices |
| **Remote reprovisioning** | Push updated configuration to devices remotely |

### Reasoning

- Covers full enterprise device provisioning lifecycle
- Zero-touch and auto-discovery reduce operational overhead for tenant administrators
- Template-based approach supports multi-vendor and tenant branding
- Secure authentication and HTTPS align with enterprise security requirements
- Remote reprovisioning supports device reassignment and configuration updates

### Consequences

- `provisioning` module owns these responsibilities in NestJS application layer
- Provisioning Server delivers configuration; Kamailio handles post-provisioning SIP registration separately
- Firmware management is a platform capability; scheduling is future support (see Section 12)
- Specific authentication mechanisms are deferred to implementation

---

## 5. Every Device Belongs to One Tenant

### Context

Multi-tenant isolation requires all devices to be scoped to a single customer account. Cross-tenant device assignment is a critical security failure.

### Decision

**Every device belongs to one Tenant.**

### Reasoning

- Approved in [ADR-002](ADR-002-tenant-domain-model.md) and [ADR-003](ADR-003-telephony-platform-decisions.md)
- Device is a tenant-scoped entity in the domain model
- Provisioning must resolve Tenant context before generating configuration
- Aligns with `tenant_id` on every business entity ([ADR-006](ADR-006-database-design.md))

### Consequences

- Device records include `tenant_id`
- Provisioning Service validates Tenant context during auto-discovery
- Configuration templates are rendered within Tenant scope
- Devices cannot be provisioned or moved across Tenant boundaries

---

## 6. Every Device Assigned to One Line at a Time

### Context

A Line represents a telephony identity and owns Devices for ringing ([ADR-003](ADR-003-telephony-platform-decisions.md)). A device must have a single active Line assignment for consistent call delivery and caller ID.

### Decision

**Every device is assigned to one Line at a time.**

### Reasoning

- Line owns Devices in the approved domain model
- Single Line assignment ensures unambiguous telephony identity per device
- Supports single identity across devices through Line ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Provisioning configuration (extension, SIP credentials) derives from assigned Line

### Consequences

- Device provisioning includes Line-specific SIP and extension configuration
- A Device cannot ring for multiple Lines simultaneously
- Line reassignment triggers remote reprovisioning
- Historical Line assignment may be tracked for audit (details deferred)

---

## 7. Devices May Be Reassigned

### Context

Enterprise environments reassign desk phones as staff change roles, depart, or relocate. Devices are physical assets that outlive individual User and Line assignments.

### Decision

**Devices may be reassigned.**

### Reasoning

- Approved in [ADR-002](ADR-002-tenant-domain-model.md) and [ADR-003](ADR-003-telephony-platform-decisions.md)
- Device may be reassigned to another User over time
- Remote reprovisioning supports configuration update on reassignment
- Avoids requiring new Device records for hardware reuse

### Consequences

- Device reassignment triggers remote reprovisioning with new Line configuration
- Reassignment remains within the owning Tenant
- Previous Line association is replaced; device is assigned to one Line at a time
- Reassignment history is auditable per [ADR-003](ADR-003-telephony-platform-decisions.md)

---

## 8. Provisioning Templates Are Versioned

### Context

Configuration templates evolve as platform features, vendor firmware, and tenant requirements change. Unversioned templates risk applying incompatible configuration to devices.

### Decision

**Provisioning templates are versioned.**

### Reasoning

- Supports configuration versioning responsibility in provisioning architecture
- Enables controlled rollout of template changes
- Allows rollback to prior template versions if issues arise
- Aligns with soft delete and audit conventions ([ADR-002](ADR-002-tenant-domain-model.md))

### Consequences

- Each template has a version identifier
- Devices record which template version was applied
- Template updates do not automatically overwrite all devices; reprovisioning applies new versions
- Template version storage and diff format are deferred to implementation

---

## 9. Tenant Branding Supported

### Context

Enterprise customers require branded provisioning experiences — custom logos, display names, and tenant-specific UI elements on desk phones.

### Decision

**Tenant branding is supported in provisioning.**

### Reasoning

- Differentiates VSP Phone v4 as an enterprise white-label capable platform
- Branding is a tenant-scoped configuration concern
- Template-based provisioning accommodates tenant-specific branding variables
- Common enterprise UCaaS customer requirement

### Consequences

- Provisioning templates accept tenant branding parameters
- Branding configuration is stored per Tenant (details deferred)
- Configuration Generator injects branding into device configuration output
- Branding scope (logo, display name, etc.) is deferred to implementation

---

## 10. Secure Provisioning Using HTTPS

### Context

Device provisioning delivers SIP credentials and configuration over the network. Plaintext provisioning exposes credentials to interception.

### Decision

**Secure provisioning uses HTTPS.**

### Reasoning

- Implements secure device authentication responsibility
- Aligns with **Security First** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Industry standard for modern IP phone provisioning
- Protects SIP credentials during zero-touch provisioning

### Consequences

- Provisioning Server serves configuration over HTTPS only
- Devices must trust the provisioning server certificate (details deferred)
- Plaintext HTTP provisioning is not approved
- Certificate management for provisioning server is deferred to deployment ADRs

---

## 11. MAC Addresses Are Unique

### Context

Auto-discovery identifies devices by MAC address. Duplicate MAC addresses would cause provisioning conflicts and incorrect device-to-tenant assignment.

### Decision

**MAC addresses are unique within the platform.**

### Reasoning

- MAC address is the standard device identifier for auto-discovery and zero-touch provisioning
- Uniqueness prevents two devices from receiving the same provisioning configuration
- Supports secure device authentication during provisioning
- Required for reliable device inventory management

### Consequences

- Device registration enforces MAC address uniqueness at platform scope
- Auto-discovery resolves Device record by MAC address
- MAC address conflict on provisioning attempt is rejected
- Whether uniqueness is global or per-tenant is platform-global per this decision

---

## 12. Future Support

### Context

Advanced desk phone features and operational capabilities are required for full enterprise parity but are not in the initial provisioning scope.

### Decision

The following capabilities are approved for **future support**:

| Capability | Description |
|------------|-------------|
| **BLF** | Busy Lamp Field monitoring |
| **Busy Lamp Fields** | Extension presence indicators on phone keys |
| **Shared Line Appearance** | Multiple devices sharing a single Line appearance |
| **Firmware scheduling** | Scheduled firmware update windows |
| **Auto backup** | Automatic device configuration backup |

### Reasoning

- Standard enterprise desk phone features expected in mature UCaaS platforms
- BLF and Shared Line Appearance require provisioning template extensions
- Firmware scheduling extends firmware management responsibility
- Auto backup supports device recovery and audit
- Implementation is explicitly deferred; architecture must not preclude these features

### Consequences

- Initial provisioning does not implement these capabilities
- Provisioning templates and Configuration Generator are designed for future extension
- BLF and Busy Lamp Fields may be addressed in a single future feature ADR
- Each future capability requires implementation planning when prioritized

---

## 13. Summary

### Supported Devices

Grandstream GRP Series, Grandstream GXP Series

### Future Vendors

Yealink, Fanvil, Poly

### Architecture Flow

```
Phone → Provisioning Service → Configuration Generator → Provisioning Server → Device
```

### Provisioning Responsibilities

Zero-touch provisioning, Auto-discovery, Configuration generation, Firmware management, Template-based provisioning, Secure device authentication, Configuration versioning, Remote reprovisioning

### Rules

| Rule | Value |
|------|-------|
| Device Tenant scope | One Tenant |
| Device Line assignment | One Line at a time |
| Device reassignment | Supported |
| Templates | Versioned |
| Tenant branding | Supported |
| Provisioning transport | HTTPS |
| MAC addresses | Unique |

### Future Support

BLF, Busy Lamp Fields, Shared Line Appearance, Firmware scheduling, Auto backup

---

## 14. References

- [ADR-002: Tenant Domain Model](ADR-002-tenant-domain-model.md)
- [ADR-003: Telephony Platform Decisions](ADR-003-telephony-platform-decisions.md)
- [ADR-004: Call Architecture](ADR-004-call-architecture.md)
- [ADR-008: Kamailio Architecture](ADR-008-kamailio-architecture.md)
- [Domain Model](../03-database/domain-model.md)
- [ADR Index](./README.md)
