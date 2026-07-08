# ADR-006: Database Design

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR defines the **approved database architecture** for VSP Phone v4. It establishes technology choices, entity conventions, scalability direction, and performance requirements for all persistent data.

These decisions align with:

- [ADR-001](ADR-001-overall-system-architecture.md) — PostgreSQL, Prisma, Multi Tenant, Horizontally Scalable
- [ADR-002](ADR-002-tenant-domain-model.md) — `tenant_id`, soft delete, audit history
- [ADR-003](ADR-003-telephony-platform-decisions.md) — Platform UUID, full audit trail
- [ADR-004](ADR-004-call-architecture.md) — Call sessions, lifecycle, archival
- [Domain Model](../03-database/domain-model.md) — Approved business entities

This ADR does **not** define Prisma models, SQL schemas, migrations, or implementation details.

---

## Table of Contents

### Database

1. [PostgreSQL](#1-postgresql)
2. [Prisma ORM](#2-prisma-orm)
3. [UUID Primary Keys](#3-uuid-primary-keys)
4. [UTC Timestamps](#4-utc-timestamps)
5. [Soft Delete](#5-soft-delete)
6. [Audit Support](#6-audit-support)

### Architecture

7. [tenant_id on Every Business Entity](#7-tenant_id-on-every-business-entity)
8. [created_at on Every Entity](#8-created_at-on-every-entity)
9. [updated_at on Every Entity](#9-updated_at-on-every-entity)
10. [deleted_at on Every Entity](#10-deleted_at-on-every-entity)
11. [Application-Generated UUIDs](#11-application-generated-uuids)
12. [No Cascading Deletes](#12-no-cascading-deletes)
13. [Foreign Keys for Referential Integrity](#13-foreign-keys-for-referential-integrity)
14. [Normalize Transactional Data](#14-normalize-transactional-data)
15. [JSONB for Flexible Metadata Only](#15-jsonb-for-flexible-metadata-only)
16. [Separate SIP and Carrier Configuration](#16-separate-sip-and-carrier-configuration)

### Scalability

17. [Horizontal Application Scaling](#17-horizontal-application-scaling)
18. [Read Replicas Supported](#18-read-replicas-supported)
19. [Future Partitioning](#19-future-partitioning)
20. [Future Archival Strategy](#20-future-archival-strategy)

### Performance

21. [Composite Indexes for tenant_id](#21-composite-indexes-for-tenant_id)
22. [Avoid N+1 Queries](#22-avoid-n1-queries)
23. [Optimize for Tenant-Scoped Lookups](#23-optimize-for-tenant-scoped-lookups)
24. [Support Millions of Call Records](#24-support-millions-of-call-records)

25. [Summary](#25-summary)
26. [References](#26-references)

---

## Database

## 1. PostgreSQL

### Context

VSP Phone v4 requires a relational database that supports multi-tenant transactional workloads, referential integrity, JSON flexibility, and enterprise-scale operational maturity.

### Decision

**PostgreSQL is the approved database for VSP Phone v4.**

### Reasoning

- Accepted in the approved technology stack ([ADR-001](ADR-001-overall-system-architecture.md))
- Supports foreign keys, transactions, JSONB, partitioning, and read replicas
- Proven for multi-tenant SaaS and telecom-adjacent workloads
- Strong ecosystem alignment with Prisma ORM

### Consequences

- All persistent business data resides in PostgreSQL
- Database operations target PostgreSQL capabilities and conventions
- Alternative databases are not approved without a new ADR

---

## 2. Prisma ORM

### Context

The application layer requires a type-safe, maintainable data access layer consistent with the NestJS modular monolith and API-first architecture.

### Decision

**Prisma is the approved ORM for VSP Phone v4.**

### Reasoning

- Accepted in the approved technology stack ([ADR-001](ADR-001-overall-system-architecture.md))
- Provides type-safe schema definition and query generation for NestJS
- Supports PostgreSQL features including JSONB and migrations (migrations defined separately)
- Aligns with existing workspace initialization

### Consequences

- All application data access goes through Prisma
- Schema evolution is managed via Prisma migration workflow (defined in future work)
- Raw SQL usage requires justification and is not the default pattern

---

## 3. UUID Primary Keys

### Context

The platform uses UUIDs for call identity and distributed application scaling. Primary keys must support globally unique identifiers without collision across tenants and services.

### Decision

**UUID primary keys are used for all business entities.**

### Reasoning

- Aligns with Platform UUID for calls ([ADR-004](ADR-004-call-architecture.md))
- Supports application-generated identifiers without database sequence coordination
- Safe for horizontal application scaling and future service decomposition
- Avoids predictable integer ID enumeration across tenants

### Consequences

- All entity primary keys are UUID type
- UUID format and version are deferred to application layer decisions
- Index and storage implications of UUID keys are accepted

---

## 4. UTC Timestamps

### Context

VSP Phone v4 serves tenants across time zones. Timestamp storage must be consistent and unambiguous for audit, billing, reporting, and call records.

### Decision

**All timestamps are stored in UTC.**

### Reasoning

- Eliminates ambiguity across tenant time zones and daylight saving changes
- Standard practice for multi-tenant cloud platforms
- Simplifies cross-tenant reporting and platform operations
- Aligns with audit and compliance requirements

### Consequences

- `created_at`, `updated_at`, and `deleted_at` are stored in UTC
- Application layer converts to local time for display only
- No local-timezone timestamp storage in the database

---

## 5. Soft Delete

### Context

Enterprise platforms require deactivation of resources without immediate physical removal, preserving historical context for calls, billing, and audit.

### Decision

**Soft Delete is supported for all business entities via `deleted_at`.**

### Reasoning

- Approved in [ADR-002](ADR-002-tenant-domain-model.md) and [ADR-003](ADR-003-telephony-platform-decisions.md)
- Preserves referential integrity for historical call and audit records
- Supports resource recovery after administrative errors
- Complements the no cascading deletes decision

### Consequences

- Physical deletion is not the default operational behavior
- Active queries exclude records where `deleted_at` is set
- Unique constraints must account for soft-deleted records (details deferred)
- Purge policies for soft-deleted data are deferred to future ADRs

---

## 6. Audit Support

### Context

Enterprise UCaaS requires traceability of data changes for compliance, security, and operational accountability.

### Decision

**The database architecture supports Audit history for all business entities.**

### Reasoning

- Approved in [ADR-002](ADR-002-tenant-domain-model.md) and [ADR-003](ADR-003-telephony-platform-decisions.md)
- Implements the **Security First** principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Supports the Audit Platform Service in the domain model
- `created_at` and `updated_at` provide baseline temporal audit; full audit trail extends beyond these fields

### Consequences

- Entity changes are auditable within Tenant scope
- Audit log storage and retention are recognized scalability concerns (see Future Partitioning)
- Audit immutability and access controls are deferred to future ADRs

---

## Architecture

## 7. tenant_id on Every Business Entity

### Context

Multi-tenant isolation requires every business record to be unambiguously scoped to a single Tenant.

### Decision

**Every business entity includes `tenant_id`.**

### Reasoning

- Approved in [ADR-002](ADR-002-tenant-domain-model.md) — every resource includes `tenant_id`
- Enforces tenant isolation at the data layer
- Enables tenant-scoped queries, indexing, and authorization
- Implements the **Multi Tenant** architecture principle

### Consequences

- No business entity exists without `tenant_id`
- All queries on business data must include tenant scope
- Cross-tenant queries are prohibited at the application layer
- Platform-level tables (if any) are exempt; business entities are not

---

## 8. created_at on Every Entity

### Context

Creation timestamps are required for audit, reporting, lifecycle management, and operational troubleshooting.

### Decision

**Every entity includes `created_at`.**

### Reasoning

- Standard temporal metadata for all persisted records
- Supports audit support and compliance requirements
- Enables time-based queries and reporting
- Complements UTC timestamp decision

### Consequences

- `created_at` is set at record creation and is immutable
- All entities carry creation timestamp in UTC
- Application layer is responsible for setting `created_at` on insert

---

## 9. updated_at on Every Entity

### Context

Modification timestamps are required to track when records were last changed for audit, synchronization, and operational visibility.

### Decision

**Every entity includes `updated_at`.**

### Reasoning

- Supports audit support and change tracking
- Enables optimistic concurrency patterns (details deferred)
- Standard practice for mutable business entities
- Complements `created_at` for full temporal metadata

### Consequences

- `updated_at` is refreshed on every record modification
- All entities carry modification timestamp in UTC
- Application layer is responsible for maintaining `updated_at`

---

## 10. deleted_at on Every Entity

### Context

Soft delete requires a dedicated field to mark deactivated records without physical removal.

### Decision

**Every entity includes `deleted_at`.**

### Reasoning

- Implements Soft Delete decision (Section 5)
- Approved entity convention from [ADR-002](ADR-002-tenant-domain-model.md)
- `NULL` indicates active record; non-null value indicates soft-deleted record
- Consistent soft delete semantics across all business entities

### Consequences

- Soft delete sets `deleted_at` to current UTC timestamp
- Restore clears `deleted_at` to `NULL` (behavior deferred)
- Active-record queries filter `deleted_at IS NULL`

---

## 11. Application-Generated UUIDs

### Context

UUID primary keys require a defined generation strategy. Database-generated and application-generated UUIDs have different implications for testing, distributed systems, and idempotency.

### Decision

**UUIDs are generated by the application.**

### Reasoning

- Application can assign IDs before database insert, enabling idempotent operations
- Supports creating related records with known IDs in a single transaction
- Aligns with Platform UUID generation for calls ([ADR-004](ADR-004-call-architecture.md))
- Decouples ID generation from database sequence or default constraints

### Consequences

- NestJS application layer generates UUIDs before persistence
- Database does not rely on `gen_random_uuid()` or serial defaults for primary keys
- UUID generation library and version selection are deferred to implementation

---

## 12. No Cascading Deletes

### Context

Cascading deletes in a multi-tenant platform risk unintended data loss, especially with soft delete and audit requirements. Referential cleanup must be explicit.

### Decision

**No cascading deletes are used.**

### Reasoning

- Aligns with soft delete — deactivation is preferred over physical removal
- Prevents accidental mass deletion of related tenant data
- Supports audit trail preservation for historical records
- Forces explicit, auditable delete operations in application logic

### Consequences

- Foreign keys do not specify `ON DELETE CASCADE`
- Application layer handles referential cleanup explicitly
- Orphan prevention rules are enforced in application logic (details deferred)
- Soft delete does not trigger cascade; related record handling is explicit

---

## 13. Foreign Keys for Referential Integrity

### Context

Business entities have defined relationships in the domain model (Tenant → Site → User → Line → Device, etc.). Referential integrity must be enforced at the database level.

### Decision

**Foreign keys are used for referential integrity.**

### Reasoning

- Enforces approved domain model relationships at the persistence layer
- Prevents orphaned records within tenant scope
- Complements normalized transactional data decision
- PostgreSQL natively supports foreign key constraints

### Consequences

- All defined entity relationships use foreign key constraints
- Foreign keys do not cascade on delete (see No Cascading Deletes)
- Cross-tenant foreign key references are prohibited
- Soft-deleted parent records require explicit handling in application logic

---

## 14. Normalize Transactional Data

### Context

Transactional business data — tenants, users, lines, devices, phone numbers, queues — has well-defined relationships and must support consistent updates, referential integrity, and tenant-scoped queries.

### Decision

**Transactional data is normalized.**

### Reasoning

- Aligns with relational model and foreign key integrity
- Supports consistent updates across related entities
- Reduces data duplication and update anomalies
- Matches the structured domain model with defined entity relationships

### Consequences

- Core business entities are stored in normalized tables
- Denormalization for read performance uses read replicas or materialized views (deferred)
- JSONB is not used for core transactional fields (see JSONB decision)
- Reporting denormalization is deferred to analytics layer

---

## 15. JSONB for Flexible Metadata Only

### Context

Some data is inherently schema-flexible — provider-specific carrier configuration, extensible metadata, and integration-specific attributes. Unstructured use of JSONB would undermine normalization and queryability of core business data.

### Decision

**JSONB is used only for flexible metadata and provider-specific configuration.**

### Reasoning

- Preserves normalization for core transactional entities
- Provides flexibility where schema variation is expected (carrier configs, integration metadata)
- PostgreSQL JSONB supports indexing for targeted queries on metadata fields
- Prevents JSONB from becoming a substitute for proper entity modeling

### Consequences

- Core business fields are typed columns, not JSONB
- JSONB columns are limited to approved use cases: metadata and provider-specific configuration
- JSONB field schemas and validation rules are deferred to implementation
- New JSONB use cases require ADR review

---

## 16. Separate SIP and Carrier Configuration

### Context

SIP signaling configuration (Kamailio) and carrier interconnect settings (Telnyx, BYOC) are infrastructure concerns with different lifecycles, formats, and change frequency than core business entities.

### Decision

**SIP and carrier configuration are stored separately from business entities.**

### Reasoning

- Aligns with Kamailio and carrier module boundaries in the application architecture
- SIP and carrier configs change independently of business entity lifecycle
- Prevents coupling infrastructure configuration to domain entity tables
- Supports Multiple Carriers and BYOC ([ADR-003](ADR-003-telephony-platform-decisions.md))

### Consequences

- Business entities (Line, Device, Phone Number) do not embed SIP or carrier configuration
- SIP configuration resides in infrastructure/Kamailio scope with separate persistence (details deferred)
- Carrier configuration is managed through the `carrier` module with separate storage
- Correlation between business entities and infrastructure config is via references, not embedded data

---

## Scalability

## 17. Horizontal Application Scaling

### Context

VSP Phone v4 targets carrier-grade, multi-tenant scale. The database must not become a bottleneck that prevents horizontal scaling of application instances.

### Decision

**The database is designed for horizontal application scaling.**

### Reasoning

- Implements **Horizontally Scalable** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Application-generated UUIDs avoid database-coordinated ID generation
- Stateless application instances can scale independently behind a load balancer
- Supports Kubernetes-ready deployment direction

### Consequences

- Application layer must not rely on in-process state for data consistency
- Database connection pooling is required at scale (details deferred)
- Session affinity is not required for database access
- Distributed locking strategies for concurrent operations are deferred to future ADRs

---

## 18. Read Replicas Supported

### Context

Read-heavy workloads — reporting, analytics, directory lookups, call history — must not contend with transactional write operations as tenant and call volume grows.

### Decision

**Read replicas are supported.**

### Reasoning

- Separates read and write database load
- Supports reporting and analytics without impacting transactional performance
- Standard PostgreSQL capability aligned with horizontal scaling goals
- Enables future read-scaling as call volume increases

### Consequences

- Read-heavy queries may target read replicas
- Replication lag tolerance rules are deferred to implementation
- Write operations always target the primary database
- Read replica routing strategy is deferred to future ADRs

---

## 19. Future Partitioning

### Context

High-volume tables — call sessions, audit logs, and CDRs — will grow without bound as the platform scales. Monolithic tables for these entities will eventually impact query and maintenance performance.

### Decision

**Future partitioning is planned for Call Sessions, Audit Logs, and CDRs.**

### Reasoning

- Supports millions of call records performance target
- Aligns with call lifecycle Archived state and future archival strategy
- Audit logs and CDRs are append-heavy, time-series workloads suited to partitioning
- Partitioning is deferred to avoid premature optimization at initial scale

### Consequences

- Call Sessions, Audit Logs, and CDR tables are designed with future partitioning in mind
- Partition key selection (time-based, tenant-based) is deferred to future ADRs
- Initial schema does not require partitioning at launch
- Application queries should be compatible with future partition pruning

---

## 20. Future Archival Strategy

### Context

Historical call data, audit logs, and CDRs accumulate over time. Retaining all data in the primary database indefinitely is not sustainable at scale.

### Decision

**A future archival strategy for historical data is planned.**

### Reasoning

- Aligns with Call lifecycle **Archived** state ([ADR-004](ADR-004-call-architecture.md))
- Complements future partitioning for high-volume tables
- Supports compliance retention requirements without unbounded primary database growth
- Archival strategy is deferred to avoid premature implementation

### Consequences

- Archived call sessions are candidates for cold storage migration
- Retention periods and archival targets are deferred to future ADRs
- Primary database retains active and recently archived data
- Reporting on archived data may require separate access patterns

---

## Performance

## 21. Composite Indexes for tenant_id

### Context

Every query on business data is tenant-scoped. Indexes that do not lead with `tenant_id` will not efficiently support multi-tenant query patterns.

### Decision

**Composite indexes lead with `tenant_id`.**

### Reasoning

- Optimizes tenant-scoped lookups (see Section 23)
- Supports millions of records across many tenants without full table scans
- Standard multi-tenant indexing pattern for shared-database architecture
- Aligns with every entity includes `tenant_id` decision

### Consequences

- Primary query indexes are composite: `(tenant_id, ...)`
- Single-column indexes on non-tenant fields alone are insufficient for tenant queries
- Specific composite index definitions are deferred to schema design
- Index maintenance cost is accepted for query performance

---

## 22. Avoid N+1 Queries

### Context

NestJS application services querying related entities risk N+1 query patterns that degrade performance linearly with result set size, especially at scale.

### Decision

**N+1 queries are avoided.**

### Reasoning

- Critical for performance at millions of call records
- Prisma supports eager loading and relation queries to prevent N+1
- Aligns with normalized data model where entities have many relationships
- Application layer responsibility under modular monolith architecture

### Consequences

- Data access patterns use eager loading, joins, or batch queries
- N+1 patterns are flagged in code review and testing
- Specific Prisma query patterns are deferred to implementation
- Performance testing validates query efficiency per module

---

## 23. Optimize for Tenant-Scoped Lookups

### Context

All business operations occur within a Tenant context. Queries that scan across tenants are prohibited and would not scale.

### Decision

**Database access is optimized for tenant-scoped lookups.**

### Reasoning

- Implements `tenant_id` on every business entity ([ADR-002](ADR-002-tenant-domain-model.md))
- Composite indexes with `tenant_id` support efficient per-tenant queries
- Prevents cross-tenant table scans that degrade performance for all tenants
- Aligns with application-layer tenant context enforcement

### Consequences

- Every business query includes `tenant_id` in the WHERE clause
- Query plans should use tenant-leading composite indexes
- Cross-tenant reporting uses dedicated platform-level queries (deferred)
- Tenant isolation and query performance are co-designed

---

## 24. Support Millions of Call Records

### Context

VSP Phone v4 is a carrier-grade platform targeting enterprise call volume. Call session and CDR tables must sustain millions of records per tenant and across the platform.

### Decision

**The database architecture supports millions of call records.**

### Reasoning

- Carrier-grade platform requirement
- Supported by future partitioning, archival, read replicas, and composite indexing decisions
- Aligns with Platform UUID and event-driven call architecture for scalable call data ingestion
- Informs schema design for call-related tables from the outset

### Consequences

- Call Sessions and CDR tables are designed for high-volume append workloads
- Query patterns on call data must be efficient at millions of rows
- Archival and partitioning are required paths to sustain long-term growth
- Specific row-count targets per tenant are deferred to capacity planning

---

## 25. Summary

### Database

| Decision | Value |
|----------|-------|
| Database | PostgreSQL |
| ORM | Prisma |
| Primary keys | UUID |
| Timestamps | UTC |
| Delete strategy | Soft Delete (`deleted_at`) |
| Audit | Supported |

### Entity Conventions

| Field | Required |
|-------|----------|
| `tenant_id` | Every business entity |
| `created_at` | Every entity |
| `updated_at` | Every entity |
| `deleted_at` | Every entity |

### Architecture Rules

| Rule | Value |
|------|-------|
| UUID generation | Application |
| Cascading deletes | None |
| Referential integrity | Foreign keys |
| Transactional data | Normalized |
| JSONB usage | Metadata and provider config only |
| SIP/carrier config | Separate from business entities |

### Scalability

| Capability | Status |
|------------|--------|
| Horizontal application scaling | Designed for |
| Read replicas | Supported |
| Partitioning (Call Sessions, Audit, CDRs) | Future |
| Archival strategy | Future |

### Performance

| Requirement | Approach |
|-------------|----------|
| Tenant-scoped indexes | Composite, `tenant_id`-leading |
| Query efficiency | Avoid N+1 |
| Lookup pattern | Tenant-scoped |
| Call volume | Millions of records |

---

## 26. References

- [ADR-001: Overall System Architecture](ADR-001-overall-system-architecture.md)
- [ADR-002: Tenant Domain Model](ADR-002-tenant-domain-model.md)
- [ADR-003: Telephony Platform Decisions](ADR-003-telephony-platform-decisions.md)
- [ADR-004: Call Architecture](ADR-004-call-architecture.md)
- [Domain Model](../03-database/domain-model.md)
- [ADR Index](./README.md)
