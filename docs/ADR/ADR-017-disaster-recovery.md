# ADR-017: Disaster Recovery

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved disaster recovery (DR) strategy** for VSP Phone v4. It defines backup scope, recovery capabilities, high availability requirements, DR objectives, and testing requirements.

These decisions align with:

- [ADR-001](ADR-001-overall-system-architecture.md) — High Availability, Security First, Cloud Native
- [ADR-002](ADR-002-tenant-domain-model.md) — Tenant isolation
- [ADR-004](ADR-004-call-architecture.md) — Call recordings and Platform UUID
- [ADR-006](ADR-006-database-design.md) — PostgreSQL, read replicas
- [ADR-008](ADR-008-kamailio-architecture.md) — Kamailio HA cluster
- [ADR-009](ADR-009-rtpengine-architecture.md) — Multiple RTPengine instances
- [ADR-011](ADR-011-grandstream-provisioning.md) — Provisioning data and templates
- [ADR-015](ADR-015-deployment-architecture.md) — Object storage for recordings, persistent volumes

This ADR does **not** define backup scripts, backup schedules, retention periods, RTO/RPO targets, replication topology, or infrastructure configuration.

---

## Table of Contents

### Backup Scope

1. [PostgreSQL Backup](#1-postgresql-backup)
2. [Redis Backup](#2-redis-backup)
3. [Object Storage Backup](#3-object-storage-backup)
4. [Configuration Backup](#4-configuration-backup)
5. [Provisioning Data Backup](#5-provisioning-data-backup)

### Recovery Capabilities

6. [Point-in-Time Recovery](#6-point-in-time-recovery)
7. [Automated Backups](#7-automated-backups)
8. [Backup Verification](#8-backup-verification)

### High Availability

9. [Database Replication](#9-database-replication)
10. [Multiple RTPengine Instances](#10-multiple-rtpengine-instances)
11. [Multiple Kamailio Instances](#11-multiple-kamailio-instances)

### DR Objectives

12. [Minimize Downtime](#12-minimize-downtime)
13. [Preserve Tenant Isolation](#13-preserve-tenant-isolation)
14. [Protect Recordings](#14-protect-recordings)
15. [Recover Configuration](#15-recover-configuration)

### DR Testing

16. [Scheduled Disaster Recovery Drills](#16-scheduled-disaster-recovery-drills)
17. [Restore Validation](#17-restore-validation)

18. [Summary](#18-summary)
19. [References](#19-references)

---

## 1. PostgreSQL Backup

### Context

PostgreSQL is the system of record for all business entities, call metadata, CDR, audit history, and tenant data ([ADR-006](ADR-006-database-design.md)). Loss of database data is catastrophic and unrecoverable without backups.

### Decision

**PostgreSQL is an approved backup target.**

### Reasoning

- All transactional business data resides in PostgreSQL
- Tenant data, call sessions, billing, and audit records require durable backup
- Required foundation for point-in-time recovery
- Aligns with persistent volume requirements ([ADR-015](ADR-015-deployment-architecture.md))

### Consequences

- PostgreSQL backups are included in the platform DR strategy
- Backup method, frequency, and storage location are deferred to implementation
- Backup scope includes all production PostgreSQL databases
- Backup encryption and access controls are deferred to security configuration

---

## 2. Redis Backup

### Context

Redis holds session state, cache data, and shared ephemeral state used by stateless NestJS instances ([ADR-015](ADR-015-deployment-architecture.md)). While not the system of record, Redis data loss affects active sessions and operational continuity.

### Decision

**Redis is an approved backup target.**

### Reasoning

- Redis supports session and cache state for horizontally scaled API instances
- Backup enables faster recovery of operational state after failure
- Complements PostgreSQL backup for complete platform data protection
- Reduces recovery effort after Redis failure or data loss

### Consequences

- Redis backups are included in the platform DR strategy
- Backup scope and persistence strategy (RDB, AOF, or both) are deferred to implementation
- Redis is not the authoritative source for business data; PostgreSQL remains system of record
- Session re-establishment after Redis restore without backup is an acceptable fallback (policy deferred)

---

## 3. Object Storage Backup

### Context

Call recording media is stored in object storage, separate from PostgreSQL ([ADR-015](ADR-015-deployment-architecture.md), [ADR-009](ADR-009-rtpengine-architecture.md)). Recording media volume grows without bound and is required for compliance, billing disputes, and customer access.

### Decision

**Object storage is an approved backup target.**

### Reasoning

- Recording media files are not stored in PostgreSQL
- Recording loss is irreversible and has legal and commercial consequences
- Object storage requires independent backup or replication strategy
- Protects recordings referenced by NestJS recording metadata ([ADR-004](ADR-004-call-architecture.md))

### Consequences

- Object storage backup or cross-region replication is included in DR strategy
- Backup scope covers all recording media buckets
- Object storage provider redundancy features may complement explicit backups (details deferred)
- Recording retention policies interact with backup retention (policy deferred)

---

## 4. Configuration Backup

### Context

Platform operation depends on configuration across NestJS application settings, Kamailio routing rules, RTPengine policies, carrier trunk settings, and deployment manifests. Configuration loss requires manual reconstruction and extends recovery time.

### Decision

**Configuration is an approved backup target.**

### Reasoning

- Kamailio and RTPengine require operational configuration for signaling and media ([ADR-008](ADR-008-kamailio-architecture.md), [ADR-009](ADR-009-rtpengine-architecture.md))
- Carrier Adapter and trunk configuration affect PSTN connectivity ([ADR-010](ADR-010-carrier-abstraction.md))
- Configuration-as-code and version control may supplement backups (mechanism deferred)
- Recovering configuration is an explicit DR objective

### Consequences

- Application, telecom, and deployment configuration are backed up
- Configuration backup scope includes Kamailio, RTPengine, NestJS, and carrier settings
- Configuration backup mechanism (Git, object storage, secrets manager) is deferred to implementation
- Secrets and credentials backup handling follows security policy (deferred)

---

## 5. Provisioning Data Backup

### Context

Device provisioning depends on versioned templates, generated configurations, device-to-tenant mappings, and firmware references ([ADR-011](ADR-011-grandstream-provisioning.md)). Loss of provisioning data prevents device recovery and remote reprovisioning.

### Decision

**Provisioning data is an approved backup target.**

### Reasoning

- Provisioning templates are versioned and tenant-scoped
- Device assignments and MAC address mappings are business-critical
- Remote reprovisioning requires intact provisioning data
- Supports device recovery after platform failure

### Consequences

- Provisioning templates, device records, and generated configurations are backed up
- Provisioning data backup complements PostgreSQL backup (templates may span database and object storage)
- Backup scope includes `provisioning` module data and Provisioning Server assets
- Firmware image storage backup is included where firmware is hosted by the platform (deferred)

---

## 6. Point-in-Time Recovery

### Context

Data corruption, operator error, or partial failure may require restoring to a specific moment in time rather than the most recent backup. Full restore to latest backup may reintroduce corrupted or deleted data.

### Decision

**Point-in-time recovery (PITR) is an approved recovery capability.**

### Reasoning

- Required for PostgreSQL transactional data recovery after corruption or accidental deletion
- Industry standard for enterprise database DR
- Supports granular recovery without full platform restore
- Aligns with audit and compliance requirements ([ADR-003](ADR-003-telephony-platform-decisions.md))

### Consequences

- PostgreSQL PITR is a required recovery capability
- PITR scope, granularity, and retention window are deferred to implementation
- PITR for Redis, object storage, and configuration may use different mechanisms (deferred)
- PITR procedures are validated through restore testing

---

## 7. Automated Backups

### Context

Manual backup processes are error-prone and inconsistent. Carrier-grade platforms require reliable, repeatable backup execution without operator intervention.

### Decision

**Backups are automated.**

### Reasoning

- Eliminates human error in backup execution
- Ensures consistent backup coverage across all approved targets
- Required for operational reliability at scale
- Supports scheduled backup windows without manual coordination

### Consequences

- All approved backup targets are backed up by automated processes
- Backup automation scheduling and orchestration are deferred to implementation
- Backup failure alerting is required (integrates with [ADR-016](ADR-016-monitoring-observability.md))
- Manual backup capability may exist for ad-hoc operations (supplementary, not primary)

---

## 8. Backup Verification

### Context

Backups that have never been tested may be corrupt, incomplete, or unrestorable. Unverified backups provide false confidence during actual disaster scenarios.

### Decision

**Backup verification is an approved recovery requirement.**

### Reasoning

- Confirms backup integrity before a disaster occurs
- Identifies backup failures before they impact recovery
- Industry best practice for enterprise DR programs
- Complements restore validation testing

### Consequences

- Backup verification runs as part of the backup lifecycle
- Verification method (checksum, test restore, integrity scan) is deferred to implementation
- Failed verification triggers alerts ([ADR-016](ADR-016-monitoring-observability.md))
- Verification results are logged for audit

---

## 9. Database Replication

### Context

Single-node PostgreSQL is a single point of failure. Database replication provides redundancy and supports failover without full restore from backup.

### Decision

**Database replication is an approved high availability capability.**

### Reasoning

- Approved in database design — read replicas for read-heavy queries ([ADR-006](ADR-006-database-design.md))
- Replication reduces recovery time compared to backup restore alone
- Supports minimize downtime objective
- Standard PostgreSQL HA pattern for production deployments

### Consequences

- PostgreSQL operates with replication in production
- Replication topology (primary/replica, synchronous/asynchronous) is deferred to implementation
- Replication lag monitoring is required ([ADR-016](ADR-016-monitoring-observability.md))
- Failover procedures and promotion criteria are deferred to implementation

---

## 10. Multiple RTPengine Instances

### Context

RTPengine handles media relay, recording, and NAT traversal ([ADR-009](ADR-009-rtpengine-architecture.md)). A single RTPengine instance is a bottleneck and single point of failure for all active media sessions.

### Decision

**Multiple RTPengine instances are an approved high availability requirement.**

### Reasoning

- Approved in RTPengine architecture — multiple instances and horizontal scaling ([ADR-009](ADR-009-rtpengine-architecture.md))
- Media workloads are CPU and bandwidth intensive; multiple nodes required at scale
- Instance failure must not terminate all active media sessions
- Coordinated with Kamailio HA for media path selection

### Consequences

- RTPengine is deployed with multiple instances in production
- Kamailio selects among available RTPengine instances (mechanism deferred)
- Active session handling during instance failure is deferred to implementation
- RTPengine instance count and scaling policy are deferred to capacity planning

---

## 11. Multiple Kamailio Instances

### Context

Kamailio is the SIP signaling layer for all call types ([ADR-008](ADR-008-kamailio-architecture.md)). A single Kamailio node failure would disrupt all SIP registrations and active calls.

### Decision

**Multiple Kamailio instances are an approved high availability requirement.**

### Reasoning

- Approved in Kamailio architecture — HA cluster and horizontal scaling ([ADR-008](ADR-008-kamailio-architecture.md))
- Signaling continuity is critical for carrier-grade telephony
- Complements zero downtime deployment goals ([ADR-015](ADR-015-deployment-architecture.md))
- Supports minimize downtime objective

### Consequences

- Kamailio is deployed as an HA cluster with multiple instances in production
- HA topology (active/active, active/passive) is deferred to deployment configuration
- Failover mechanisms apply within the Kamailio cluster
- Kamailio HA is coordinated with RTPengine HA independently ([ADR-008](ADR-008-kamailio-architecture.md))

---

## 12. Minimize Downtime

### Context

VSP Phone v4 is a carrier-grade UCaaS platform. Extended outages affect tenant business operations, SLA commitments, and platform reputation. DR strategy must prioritize rapid recovery and continuous availability.

### Decision

**Minimize downtime is an approved disaster recovery objective.**

### Reasoning

- Aligns with High Availability architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Supports zero downtime deployment target ([ADR-015](ADR-015-deployment-architecture.md))
- HA components (database replication, multiple Kamailio/RTPengine instances) reduce outage scope
- Automated backups and PITR reduce recovery duration

### Consequences

- DR strategy prioritizes availability alongside data protection
- HA and backup capabilities are designed to reduce both outage frequency and duration
- Specific downtime targets (RTO) are deferred to SLA and operations policy
- Downtime measurement and reporting integrate with monitoring ([ADR-016](ADR-016-monitoring-observability.md))

---

## 13. Preserve Tenant Isolation

### Context

VSP Phone v4 is a multi-tenant platform. Disaster recovery operations must not commingle, expose, or corrupt data across tenant boundaries ([ADR-002](ADR-002-tenant-domain-model.md)).

### Decision

**Preserve tenant isolation is an approved disaster recovery objective.**

### Reasoning

- `tenant_id` on every business entity is a core data model rule ([ADR-006](ADR-006-database-design.md))
- Restore operations must not cross tenant data boundaries
- Backup and restore access controls must enforce tenant scoping
- Required for enterprise security and compliance posture

### Consequences

- Backup and restore procedures maintain tenant data boundaries
- Cross-tenant data exposure during DR is not permitted
- Tenant-scoped restore (single tenant recovery) is a supported capability (mechanism deferred)
- DR access is restricted to authorized platform operations personnel

---

## 14. Protect Recordings

### Context

Call recordings are produced by RTPengine and stored in object storage ([ADR-004](ADR-004-call-architecture.md), [ADR-009](ADR-009-rtpengine-architecture.md)). Recordings support compliance, billing disputes, quality assurance, and customer access. Recording loss is permanent.

### Decision

**Protect recordings is an approved disaster recovery objective.**

### Reasoning

- Recording media is irreplaceable once lost
- Recording metadata in PostgreSQL references object storage locations
- Legal and commercial consequences of recording loss
- Object storage backup is a direct consequence of this objective

### Consequences

- Recording media is included in object storage backup scope
- Recording metadata in PostgreSQL is protected via database backup and PITR
- Recording protection is validated in DR drills
- Recording retention and backup retention alignment is deferred to policy

---

## 15. Recover Configuration

### Context

Platform restoration requires more than data recovery. Kamailio routing, RTPengine policies, carrier trunks, and application settings must be restored to operational state for the platform to handle calls.

### Decision

**Recover configuration is an approved disaster recovery objective.**

### Reasoning

- Configuration backup is an approved backup target
- Telecom layer configuration is distinct from application database
- Carrier trunk and provisioning settings are required for end-to-end call flow
- Configuration recovery reduces time-to-operational after disaster

### Consequences

- DR procedures include configuration restore as a distinct step
- Configuration restore is validated in DR drills
- Configuration version history supports rollback during recovery (mechanism deferred)
- Configuration recovery order (database → config → telecom) is deferred to runbook

---

## 16. Scheduled Disaster Recovery Drills

### Context

DR capabilities that are never exercised may fail when needed. Runbooks, procedures, and team readiness degrade without regular practice. Scheduled drills validate the full DR program.

### Decision

**Scheduled disaster recovery drills are an approved testing requirement.**

### Reasoning

- Validates backup, restore, and failover procedures under controlled conditions
- Identifies gaps in runbooks, tooling, and team readiness before real disasters
- Industry standard for enterprise DR programs
- Complements backup verification and restore validation

### Consequences

- DR drills are conducted on a defined schedule (frequency deferred to operations policy)
- Drill scope may include full platform restore or component-level failover (scope deferred)
- Drill results are documented and action items tracked
- Drill scheduling avoids production peak traffic (policy deferred)

---

## 17. Restore Validation

### Context

A successful backup does not guarantee a successful restore. Restore procedures must be validated to confirm data integrity, service functionality, and tenant isolation after recovery.

### Decision

**Restore validation is an approved testing requirement.**

### Reasoning

- Confirms end-to-end recoverability from backups
- Validates data integrity after restore
- Identifies restore procedure gaps before production disaster
- Complements backup verification and DR drills

### Consequences

- Restore validation is performed as part of DR drills and backup verification
- Validation checks include data integrity, service health, and tenant isolation
- Validation criteria per backup target are deferred to runbooks
- Failed validation triggers investigation and remediation

---

## 18. Summary

### Backup Targets

| Target | Scope |
|--------|-------|
| PostgreSQL | Transactional business data |
| Redis | Session and cache state |
| Object Storage | Recording media |
| Configuration | Application, telecom, carrier settings |
| Provisioning Data | Templates, device mappings, generated configs |

### Recovery Capabilities

| Capability | Requirement |
|------------|-------------|
| Point-in-time recovery | Required |
| Automated backups | Required |
| Backup verification | Required |

### High Availability

| Component | Requirement |
|-----------|-------------|
| Database | Replication |
| RTPengine | Multiple instances |
| Kamailio | Multiple instances |

### DR Objectives

Minimize downtime, Preserve tenant isolation, Protect recordings, Recover configuration

### DR Testing

Scheduled disaster recovery drills, Restore validation

---

## 19. References

- [ADR-001: Overall System Architecture](ADR-001-overall-system-architecture.md)
- [ADR-002: Tenant Domain Model](ADR-002-tenant-domain-model.md)
- [ADR-003: Telephony Platform Decisions](ADR-003-telephony-platform-decisions.md)
- [ADR-004: Call Architecture](ADR-004-call-architecture.md)
- [ADR-006: Database Design](ADR-006-database-design.md)
- [ADR-008: Kamailio Architecture](ADR-008-kamailio-architecture.md)
- [ADR-009: RTPengine Architecture](ADR-009-rtpengine-architecture.md)
- [ADR-011: Grandstream Provisioning](ADR-011-grandstream-provisioning.md)
- [ADR-015: Deployment Architecture](ADR-015-deployment-architecture.md)
- [ADR-016: Monitoring and Observability](ADR-016-monitoring-observability.md)
- [ADR Index](./README.md)
