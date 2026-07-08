# ADR-002: Tenant Domain Model

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved tenant architecture** for VSP Phone v4. It defines how customers, organizational structure, users, telephony resources, and cross-cutting data conventions are scoped within the platform.

These decisions align with [ADR-001](ADR-001-overall-system-architecture.md) (Multi Tenant principle) and the [Domain Model](../03-database/domain-model.md).

This ADR does **not** define database tables, Prisma models, or implementation details.

---

## Table of Contents

1. [Every customer is a Tenant](#1-every-customer-is-a-tenant)
2. [Every Tenant may contain multiple Sites](#2-every-tenant-may-contain-multiple-sites)
3. [Every Site belongs to one Tenant](#3-every-site-belongs-to-one-tenant)
4. [Users may belong to multiple Sites](#4-users-may-belong-to-multiple-sites)
5. [Phone Numbers belong to a Tenant](#5-phone-numbers-belong-to-a-tenant)
6. [Phone Numbers may move between Sites](#6-phone-numbers-may-move-between-sites)
7. [Extensions are unique within a Tenant](#7-extensions-are-unique-within-a-tenant)
8. [Devices belong to one Tenant](#8-devices-belong-to-one-tenant)
9. [Devices may be reassigned to different Users](#9-devices-may-be-reassigned-to-different-users)
10. [Every resource includes tenant_id](#10-every-resource-includes-tenant_id)
11. [Every entity supports soft delete](#11-every-entity-supports-soft-delete)
12. [Every entity supports audit history](#12-every-entity-supports-audit-history)
13. [Summary](#13-summary)
14. [References](#14-references)

---

## 1. Every customer is a Tenant

### Context

VSP Phone v4 is a multi-tenant UCaaS platform serving multiple customer organizations on shared infrastructure. A clear top-level account boundary is required to isolate customer data, configuration, and telephony resources.

### Decision

**Every customer is represented as exactly one Tenant.**

### Reasoning

- Aligns with the approved **Multi Tenant** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Provides a single, unambiguous isolation boundary for all customer-owned resources
- Simplifies billing, administration, and policy enforcement at the customer account level
- Matches the approved domain hierarchy where Tenant is the root of all business entities

### Consequences

- All customer onboarding creates a Tenant
- No customer resource may exist outside a Tenant context
- Platform operators manage the platform; customers operate within their Tenant
- Cross-customer data access is prohibited at the domain level

---

## 2. Every Tenant may contain multiple Sites

### Context

Customer organizations often operate across multiple locations, regions, or business units. The platform must support organizational subdivision without creating separate customer accounts.

### Decision

**Every Tenant may contain multiple Sites.**

### Reasoning

- Reflects real-world enterprise structure within a single customer account
- Avoids forcing customers to maintain multiple Tenants for multi-location operations
- Enables site-scoped administration and resource grouping within one billing and policy boundary
- Supports approved Phone Number reassignment between Sites within the same Tenant

### Consequences

- Site is an optional but supported subdivision within every Tenant
- Tenant-level policies and resources remain authoritative across all Sites
- A Tenant with a single location may operate with one Site or none, depending on future provisioning rules (not defined in this ADR)

---

## 3. Every Site belongs to one Tenant

### Context

While Tenants may span multiple Sites, Sites must not span Tenants. Cross-tenant site sharing would break isolation guarantees.

### Decision

**Every Site belongs to exactly one Tenant.**

### Reasoning

- Preserves strict tenant isolation
- Ensures Site-scoped resources cannot leak across customer boundaries
- Maintains a clear ownership hierarchy: Platform → Tenant → Site
- Complements the decision that every customer is a Tenant

### Consequences

- A Site cannot be transferred between Tenants
- Site deletion or deactivation is scoped to its owning Tenant
- Site-level queries and administration always operate within a single Tenant context

---

## 4. Users may belong to multiple Sites

### Context

Users within a customer organization may work across multiple locations or business units. Restricting a User to a single Site would not reflect common enterprise operating models.

### Decision

**Users may belong to multiple Sites within their Tenant.**

### Reasoning

- Supports mobile and multi-location workforces within one customer account
- Avoids duplicate User records for the same person across Sites
- Aligns with the approved domain model User–Site relationship
- Preserves Tenant as the isolation boundary while allowing flexible Site membership

### Consequences

- User–Site membership is a many-to-many relationship within a Tenant
- Authorization and visibility rules must account for multi-Site Users
- User actions remain scoped to their Tenant regardless of Site membership count

---

## 5. Phone Numbers belong to a Tenant

### Context

Phone Numbers are tenant-provisioned telephony resources used for inbound and outbound calling. They must be governed by the same isolation boundary as other customer assets.

### Decision

**Phone Numbers belong to exactly one Tenant.**

### Reasoning

- Phone Numbers are customer-owned inventory, not platform-shared resources
- Tenant ownership supports number portability and billing within the customer account
- Prevents cross-tenant number assignment or routing errors
- Aligns with the approved rule that every resource belongs to exactly one Tenant

### Consequences

- Phone Numbers cannot be shared across Tenants
- Number provisioning, routing, and release are always tenant-scoped operations
- Carrier and platform number inventory must map to a Tenant at assignment time

---

## 6. Phone Numbers may move between Sites

### Context

Customers reorganize locations and reassign numbers between offices or business units. Numbers must remain within the Tenant while allowing operational flexibility across Sites.

### Decision

**Phone Numbers may be reassigned between Sites within the same Tenant.**

### Reasoning

- Reflects operational reality of multi-site enterprises
- Avoids requiring number release and re-provisioning when only Site association changes
- Maintains Tenant ownership while permitting Site-level administration
- Complements the decisions that Phone Numbers belong to a Tenant and Tenants may have multiple Sites

### Consequences

- Phone Number reassignment is permitted only within the owning Tenant
- Site changes for a Phone Number do not change Tenant ownership
- Routing and reporting may need to reflect current and historical Site association

---

## 7. Extensions are unique within a Tenant

### Context

Extensions are internal dialable identities associated with Lines. Duplicate extensions within a Tenant would cause routing ambiguity and user confusion.

### Decision

**Extensions are unique within a Tenant.**

### Reasoning

- Ensures unambiguous internal dialing within a customer organization
- Supports predictable call routing and directory services
- Allows different Tenants to use the same extension values without conflict
- Aligns with the approved domain model where Extension is owned by Line and scoped to Tenant

### Consequences

- Extension assignment must enforce uniqueness checks within the Tenant
- Extension collisions across Tenants are permitted
- Extension changes on one Line must not conflict with extensions on other Lines in the same Tenant

---

## 8. Devices belong to one Tenant

### Context

Devices (endpoints such as desk phones and softphones) are provisioned and managed within a customer account. They must not be shared across customer boundaries.

### Decision

**Devices belong to exactly one Tenant.**

### Reasoning

- Devices are tenant-provisioned endpoints tied to customer telephony configuration
- Tenant ownership supports device inventory, security, and policy enforcement
- Prevents cross-tenant device registration or call delivery
- Aligns with the approved rule that every resource belongs to exactly one Tenant

### Consequences

- Devices cannot be registered or operated across Tenants
- Device provisioning and deprovisioning are tenant-scoped operations
- Device inventory and compliance reporting operate within Tenant boundaries

---

## 9. Devices may be reassigned to different Users

### Context

Devices are physical or logical assets that outlive individual User assignments. Enterprises reassign phones and endpoints as staff change roles or depart.

### Decision

**Devices may be reassigned to different Users over time within the Tenant.**

### Reasoning

- Reflects operational device lifecycle in enterprise environments
- Avoids requiring new Device records for every User change
- Supports hardware reuse and endpoint pool management
- Aligns with the approved domain model Device–User relationship

### Consequences

- Device ownership history must be trackable over time
- Reassignment affects which User receives calls on associated Lines
- Device reassignment remains within the owning Tenant; cross-tenant reassignment is not permitted

---

## 10. Every resource includes tenant_id

### Context

Consistent tenant scoping is required across all persisted business data to enforce isolation, support querying, and align application modules with the multi-tenant architecture.

### Decision

**Every resource includes `tenant_id`.**

### Reasoning

- Provides a uniform tenant isolation key across all business entities
- Supports tenant-scoped queries, authorization, and data partitioning strategies
- Reduces risk of cross-tenant data access in application and persistence layers
- Directly implements the approved Multi Tenant architecture principle

### Consequences

- All business entity persistence must carry `tenant_id`
- Application logic must resolve and enforce Tenant context for every resource operation
- Platform Services that reference tenant data must include or resolve `tenant_id`
- Specific indexing, partitioning, and row-level security strategies are deferred to future ADRs

---

## 11. Every entity supports soft delete

### Context

Enterprise platforms require the ability to deactivate resources without immediate physical removal, supporting recovery, compliance, and referential integrity during operational changes.

### Decision

**Every business entity supports soft delete.**

### Reasoning

- Prevents accidental permanent data loss during administration
- Supports deactivated resources that retain historical context
- Aligns with enterprise operational and compliance expectations
- Complements audit history by preserving deleted entity records

### Consequences

- Physical deletion of business entities is not the default operational behavior
- Queries and APIs must distinguish active from soft-deleted records
- Unique constraints (e.g., extension uniqueness) must account for soft-deleted records (implementation deferred)
- Retention and purge policies for soft-deleted data are deferred to future ADRs

---

## 12. Every entity supports audit history

### Context

Enterprise UCaaS platforms require traceability of changes for compliance, security review, troubleshooting, and operational accountability.

### Decision

**Every business entity supports audit history.**

### Reasoning

- Supports the approved **Security First** architecture principle
- Enables forensic review of administrative and system changes
- Aligns with the Audit Platform Service in the approved domain model
- Provides accountability for tenant-scoped configuration and resource changes

### Consequences

- Entity lifecycle changes must be auditable
- Audit events are scoped to Tenant context where applicable
- Audit retention, immutability, and access controls are deferred to future ADRs
- The Audit Platform Service consumes audit history across tenant entities

---

## 13. Summary

| # | Decision | Scope |
|---|----------|-------|
| 1 | Every customer is a Tenant | Account boundary |
| 2 | Every Tenant may contain multiple Sites | Organization |
| 3 | Every Site belongs to one Tenant | Organization |
| 4 | Users may belong to multiple Sites | User membership |
| 5 | Phone Numbers belong to a Tenant | Telephony inventory |
| 6 | Phone Numbers may move between Sites | Telephony administration |
| 7 | Extensions are unique within a Tenant | Telephony identity |
| 8 | Devices belong to one Tenant | Endpoint inventory |
| 9 | Devices may be reassigned to different Users | Endpoint lifecycle |
| 10 | Every resource includes `tenant_id` | Data isolation |
| 11 | Every entity supports soft delete | Data lifecycle |
| 12 | Every entity supports audit history | Compliance |

---

## 14. References

- [ADR-001: Overall System Architecture](ADR-001-overall-system-architecture.md)
- [Domain Model](../03-database/domain-model.md)
- [ADR Index](./README.md)
