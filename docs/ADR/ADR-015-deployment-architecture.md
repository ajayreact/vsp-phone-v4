# ADR-015: Deployment Architecture

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved deployment architecture** for VSP Phone v4. It defines development and production environments, infrastructure components, deployment principles, storage, and networking requirements.

These decisions align with:

- [ADR-001](ADR-001-overall-system-architecture.md) — Docker, Kubernetes Ready, NGINX, Zero Downtime Deployments, Horizontally Scalable, High Availability, Cloud Native
- [ADR-009](ADR-009-rtpengine-architecture.md) — RTPengine records media; object storage for recordings
- [ADR-008](ADR-008-kamailio-architecture.md) — Kamailio HA cluster; horizontal scaling
- [ADR-006](ADR-006-database-design.md) — Horizontal application scaling; read replicas

This ADR does **not** define Kubernetes manifests, Dockerfiles, network diagrams, or infrastructure topology.

---

## Table of Contents

### Environments

1. [Development — Docker Compose](#1-development--docker-compose)
2. [Production — Docker](#2-production--docker)
3. [Production — Kubernetes Ready](#3-production--kubernetes-ready)

### Infrastructure Components

4. [Approved Infrastructure Components](#4-approved-infrastructure-components)

### Deployment Principles

5. [Stateless Application Servers](#5-stateless-application-servers)
6. [Horizontal Scaling](#6-horizontal-scaling)
7. [Rolling Deployments](#7-rolling-deployments)
8. [Blue/Green Deployment Ready](#8-bluegreen-deployment-ready)
9. [Zero Downtime](#9-zero-downtime)

### Storage

10. [Persistent Volumes](#10-persistent-volumes)
11. [Object Storage for Recordings](#11-object-storage-for-recordings)

### Networking

12. [Internal Service Network](#12-internal-service-network)
13. [TLS Everywhere](#13-tls-everywhere)

14. [Summary](#14-summary)
15. [References](#15-references)

---

## 1. Development — Docker Compose

### Context

Developers require a local environment that mirrors production service dependencies without requiring full Kubernetes infrastructure on developer machines.

### Decision

**Development uses Docker Compose.**

### Reasoning

- Approved in technology stack and existing workspace setup (`docker-compose.yml` with PostgreSQL and Redis)
- Provides local PostgreSQL, Redis, and future telecom service containers
- Low friction onboarding for developers without Kubernetes expertise
- Consistent service dependencies across development machines

### Consequences

- Local development runs via Docker Compose
- `docker-compose.yml` at repository root defines development services
- Telecom services (Kamailio, RTPengine) may be added to Compose for local testing (deferred)
- Development Compose configuration is separate from production deployment

---

## 2. Production — Docker

### Context

Production services must run in isolated, reproducible containers with consistent runtime environments across deployment targets.

### Decision

**Production services are containerized using Docker.**

### Reasoning

- Docker is the approved container technology ([ADR-001](ADR-001-overall-system-architecture.md))
- Enables consistent builds from development through production
- Required foundation for Kubernetes deployment
- Supports all approved infrastructure components as containerized services

### Consequences

- All production services run as Docker containers
- Container images are built from repository Dockerfiles (deferred to implementation)
- Container registry and image tagging strategy are deferred
- Docker is the container runtime; orchestration is Kubernetes (future)

---

## 3. Production — Kubernetes Ready

### Context

Carrier-grade production deployments require orchestration for horizontal scaling, rolling updates, health checks, and high availability. Kubernetes is the target orchestration platform.

### Decision

**Production is Kubernetes ready.**

### Reasoning

- Approved in technology stack — Kubernetes Ready ([ADR-001](ADR-001-overall-system-architecture.md))
- Supports horizontal scaling, rolling deployments, and zero downtime goals
- Implements **Cloud Native** architecture principle
- Implementation explicitly deferred; architecture must not preclude Kubernetes migration

### Consequences

- Container images and configuration are designed for Kubernetes deployment
- Initial production may run on Docker without Kubernetes; migration path is planned
- Kubernetes manifests are not defined in this ADR
- Cluster topology, namespaces, and node pools are deferred to future ADRs

---

## 4. Approved Infrastructure Components

### Context

VSP Phone v4 comprises distinct services with different scaling, networking, and operational characteristics. The production infrastructure component set must be explicitly defined.

### Decision

**The approved production infrastructure components are:**

| Component | Role |
|-----------|------|
| **NGINX** | Reverse proxy, TLS termination, load balancing |
| **NestJS** | Application API and business logic |
| **Kamailio** | SIP signaling proxy and registrar |
| **RTPengine** | Media relay and recording |
| **PostgreSQL** | Primary persistent data store |
| **Redis** | Cache and real-time state |

### Reasoning

- Complete approved technology stack from [ADR-001](ADR-001-overall-system-architecture.md)
- Each component has distinct scaling and operational requirements
- NGINX provides ingress; NestJS is stateless application layer; telecom stack is Kamailio + RTPengine
- PostgreSQL and Redis are approved data layer components ([ADR-006](ADR-006-database-design.md))

### Consequences

- Production deployment includes all six component types
- Each component is independently deployable and scalable
- Component count and sizing per environment are deferred
- Additional infrastructure (monitoring, object storage) is addressed in other sections

---

## 5. Stateless Application Servers

### Context

Horizontal scaling requires application instances that do not retain session state between requests. Stateful application servers prevent safe scale-out and complicate rolling deployments.

### Decision

**Application servers are stateless.**

### Reasoning

- Required for horizontal scaling ([ADR-006](ADR-006-database-design.md))
- NestJS instances must be interchangeable behind a load balancer
- Session state, cache, and persistent data reside in Redis and PostgreSQL, not application memory
- Supports rolling deployments and zero downtime goals

### Consequences

- NestJS application instances hold no local session state
- JWT authentication supports stateless API requests ([ADR-007](ADR-007-authentication-authorization.md))
- Shared state uses Redis or PostgreSQL
- SIP dialog state resides in Kamailio, not NestJS ([ADR-008](ADR-008-kamailio-architecture.md))

---

## 6. Horizontal Scaling

### Context

Tenant and call volume growth requires the platform to scale out by adding instances rather than scaling up single nodes.

### Decision

**All scalable components support horizontal scaling.**

### Reasoning

- **Horizontally Scalable** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Approved for NestJS ([ADR-006](ADR-006-database-design.md)), Kamailio ([ADR-008](ADR-008-kamailio-architecture.md)), and RTPengine ([ADR-009](ADR-009-rtpengine-architecture.md))
- Required for carrier-grade multi-tenant scale
- Kubernetes readiness supports horizontal pod scaling

### Consequences

- NestJS, Kamailio, and RTPengine scale by adding instances
- PostgreSQL scales via read replicas ([ADR-006](ADR-006-database-design.md)); Redis scales per deployment strategy (deferred)
- NGINX load balances across scaled instances
- Autoscaling triggers and policies are deferred

---

## 7. Rolling Deployments

### Context

Application updates must be deployed without taking the entire platform offline. Rolling deployments replace instances incrementally.

### Decision

**Rolling deployments are the approved deployment strategy.**

### Reasoning

- Supports zero downtime deployment goal
- Standard Kubernetes deployment strategy
- Compatible with stateless application servers
- Reduces deployment risk by incremental instance replacement

### Consequences

- Application updates deploy via rolling replacement of instances
- Old and new versions run concurrently during rollout
- Rollback is supported by reversing the rolling deployment
- Rolling deployment configuration is deferred to Kubernetes manifests

---

## 8. Blue/Green Deployment Ready

### Context

Some deployments — major version changes, database migrations, telecom configuration changes — may require instant cutover or rapid rollback beyond rolling deployment capabilities.

### Decision

**The deployment architecture is blue/green deployment ready.**

### Reasoning

- Provides instant cutover and rapid rollback capability
- Supports **Zero Downtime Deployments** principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Architecture must not preclude blue/green even if rolling is the default strategy
- Important for telecom layer changes where signaling continuity is critical

### Consequences

- Infrastructure supports running two parallel environments (blue and green)
- Blue/green is a capability, not the default deployment strategy
- Traffic cutover mechanism is deferred to implementation
- Database migration compatibility with blue/green is deferred to future ADRs

---

## 9. Zero Downtime

### Context

Enterprise UCaaS customers expect continuous telephony service. Platform deployments must not cause call drops or service unavailability.

### Decision

**Deployments target zero downtime.**

### Reasoning

- **Zero Downtime Deployments** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Carrier-grade platform requirement
- Supported by stateless servers, rolling deployments, and blue/green readiness
- Kamailio HA cluster maintains signaling during application deployments ([ADR-008](ADR-008-kamailio-architecture.md))

### Consequences

- Deployment procedures are designed to avoid service interruption
- Active calls must survive application rolling deployments (details deferred)
- Telecom layer HA compensates during application layer deployments
- Zero downtime is a target; maintenance windows for breaking changes may still be required (policy deferred)

---

## 10. Persistent Volumes

### Context

PostgreSQL, Redis, and other stateful services require durable storage that survives container restarts and rescheduling.

### Decision

**Stateful services use persistent volumes.**

### Reasoning

- PostgreSQL data must survive pod restarts and rescheduling
- Redis persistence requirements depend on use case (deferred)
- Standard Kubernetes and Docker pattern for stateful services
- Supports data durability independent of container lifecycle

### Consequences

- PostgreSQL runs with persistent volume storage in production
- Volume provisioning and backup strategy are deferred
- Stateless services (NestJS, Kamailio, RTPengine, NGINX) do not require persistent volumes
- Volume size and storage class selection are deferred

---

## 11. Object Storage for Recordings

### Context

Call recording media files produced by RTPengine ([ADR-009](ADR-009-rtpengine-architecture.md)) require durable, scalable storage separate from the application database. Recording volume grows without bound.

### Decision

**Call recording media is stored in object storage.**

### Reasoning

- RTPengine records media; NestJS stores metadata only ([ADR-004](ADR-004-call-architecture.md), [ADR-009](ADR-009-rtpengine-architecture.md))
- Object storage scales cost-effectively for large media volumes
- Separates blob storage from PostgreSQL relational data
- Supports future archival strategy for historical data ([ADR-006](ADR-006-database-design.md))

### Consequences

- Recording media files are not stored in PostgreSQL or local container filesystems
- NestJS recording metadata references object storage location
- Object storage provider and bucket structure are deferred to implementation
- Recording retention and lifecycle policies are deferred to future ADRs

---

## 12. Internal Service Network

### Context

Platform services — NestJS, Kamailio, RTPengine, PostgreSQL, Redis — communicate over internal networks. External access is controlled through defined ingress points.

### Decision

**Services communicate over an internal service network.**

### Reasoning

- Isolates internal service communication from public internet
- NGINX is the controlled ingress point for external traffic
- Kamailio and RTPengine internal control interfaces are not publicly exposed
- Standard cloud-native network segmentation practice

### Consequences

- Inter-service communication uses internal network addresses
- Only NGINX (and Kamailio SIP ports) are exposed externally as required
- Internal network topology and service discovery are deferred
- Network policies restrict cross-service communication to required paths

---

## 13. TLS Everywhere

### Context

Data in transit — API requests, SIP signaling, provisioning, admin access — must be encrypted. Plaintext communication is not acceptable for enterprise deployments.

### Decision

**TLS is required for all external and internal service communication.**

### Reasoning

- Implements **Security First** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- NGINX provides TLS termination for HTTP/HTTPS traffic
- WSS only for WebRTC clients ([ADR-012](ADR-012-webrtc-mobile-signaling.md))
- HTTPS for provisioning ([ADR-011](ADR-011-grandstream-provisioning.md))
- TLS for SIP signaling ([ADR-008](ADR-008-kamailio-architecture.md))

### Consequences

- All external client communication uses TLS
- Internal service communication uses TLS where supported
- Certificate management and rotation are operational concerns (deferred)
- Plaintext HTTP and WS are not permitted in production

---

## 14. Summary

### Environments

| Environment | Technology |
|-------------|------------|
| Development | Docker Compose |
| Production containers | Docker |
| Production orchestration | Kubernetes Ready |

### Infrastructure Components

NGINX, NestJS, Kamailio, RTPengine, PostgreSQL, Redis

### Deployment Principles

| Principle | Status |
|-----------|--------|
| Stateless application servers | Required |
| Horizontal scaling | Required |
| Rolling deployments | Approved strategy |
| Blue/Green deployment | Ready |
| Zero downtime | Target |

### Storage

| Data | Storage |
|------|---------|
| PostgreSQL, Redis | Persistent volumes |
| Recording media | Object storage |

### Networking

Internal service network, TLS everywhere

---

## 15. References

- [ADR-001: Overall System Architecture](ADR-001-overall-system-architecture.md)
- [ADR-006: Database Design](ADR-006-database-design.md)
- [ADR-008: Kamailio Architecture](ADR-008-kamailio-architecture.md)
- [ADR-009: RTPengine Architecture](ADR-009-rtpengine-architecture.md)
- [ADR-011: Grandstream Provisioning](ADR-011-grandstream-provisioning.md)
- [ADR-012: WebRTC and Mobile Signaling](ADR-012-webrtc-mobile-signaling.md)
- [ADR Index](./README.md)
