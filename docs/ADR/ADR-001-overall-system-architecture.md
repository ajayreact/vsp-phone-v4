# ADR-001: Overall System Architecture

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Context

VSP Phone v4 is a carrier-grade, multi-tenant, cloud-native UCaaS platform intended to compete with established enterprise communications providers.

The platform requires a cohesive architecture that supports:

- Multi-tenant isolation and scale
- Real-time telephony with carrier interconnect
- A modern web administration experience
- Long-term operational reliability and extensibility

This ADR records the **approved overall system architecture** for VSP Phone v4. It establishes the architectural style, technology stack, and guiding principles that downstream design, implementation, and ADRs must align with.

---

## Decision

The following architecture is **accepted** for VSP Phone v4.

### Architecture Style

| Style | Status |
|-------|--------|
| Nx Monorepo | Accepted |
| NestJS Modular Monolith | Accepted |
| Domain Driven Design (DDD) | Accepted |
| Event Driven Internal Architecture | Accepted |
| API First Design | Accepted |

### Technology Stack

#### Backend

| Technology | Status |
|------------|--------|
| NestJS | Accepted |
| PostgreSQL | Accepted |
| Prisma | Accepted |
| Redis | Accepted |

#### Telephony

| Technology | Status |
|------------|--------|
| Kamailio | Accepted |
| RTPengine | Accepted |
| Telnyx | Accepted |

#### Frontend

| Technology | Status |
|------------|--------|
| Next.js | Accepted |
| React | Accepted |

#### Infrastructure

| Technology | Status |
|------------|--------|
| Docker | Accepted |
| Kubernetes Ready | Accepted |
| NGINX | Accepted |

### Architecture Principles

The following principles are **accepted** and govern all architectural and implementation decisions:

| Principle | Status |
|-----------|--------|
| Multi Tenant | Accepted |
| Cloud Native | Accepted |
| Horizontally Scalable | Accepted |
| High Availability | Accepted |
| Carrier Agnostic | Accepted |
| API First | Accepted |
| Security First | Accepted |
| Event Driven | Accepted |
| Zero Downtime Deployments | Accepted |

---

## Consequences

### Positive

- **Unified codebase** — The Nx monorepo provides a single workspace for backend, frontend, and shared libraries with consistent tooling.
- **Clear domain boundaries** — NestJS modular monolith combined with DDD supports explicit module ownership aligned to the approved domain model.
- **Decoupled internal evolution** — Event driven internal architecture enables loose coupling between domain areas without premature service decomposition.
- **Contract-led integration** — API first design establishes explicit integration boundaries for clients, partners, and internal consumers.
- **Proven data stack** — PostgreSQL, Prisma, and Redis provide a recognized foundation for persistent and real-time platform state.
- **Separation of signaling and media** — Kamailio, RTPengine, and Telnyx align to distinct telephony responsibilities within the approved stack.
- **Operational readiness** — Docker, Kubernetes readiness, and NGINX support containerized deployment and production ingress patterns.
- **Enterprise alignment** — Accepted principles (multi-tenancy, HA, security, carrier agnosticism, zero downtime) set consistent quality expectations across the platform.

### Negative

- **Monorepo complexity** — Nx workspace governance and dependency management require disciplined conventions as the codebase grows.
- **Modular monolith discipline** — Without strict module boundaries, a monolith can accumulate coupling that undermines DDD and event driven goals.
- **Telecom stack operational burden** — Kamailio, RTPengine, and carrier integration add specialized operational expertise beyond standard application development.
- **Initial carrier dependency** — Telnyx is the approved initial carrier; carrier agnosticism requires deliberate abstraction work in later phases.

### Neutral

- Kubernetes is **ready** as a deployment target; specific cluster topology and orchestration details are deferred to future ADRs.
- Detailed API contracts, event catalogs, and schema definitions are documented separately and must conform to this ADR.
- Frontend and backend remain co-located in the monorepo while maintaining separate deployable applications.

---

## Future Considerations

The following areas require additional ADRs and detailed architecture documents. They are **not** decided in this ADR:

- Multi-tenancy isolation model and data partitioning strategy
- Event bus technology and delivery guarantees
- Kamailio, RTPengine, and Telnyx integration contracts
- API versioning and public API surface
- Authentication and authorization architecture
- Database schema and Prisma model design
- Kubernetes deployment topology and HA configuration
- Carrier abstraction beyond Telnyx
- Observability, monitoring, and SLO targets

Subsequent ADRs must be consistent with the architecture style, technology stack, and principles accepted here.

---

## References

- [Domain Model](../03-database/domain-model.md)
- [Call Architecture](../architecture/call-architecture.md)
- [Kamailio Architecture](../04-telecom/kamailio-architecture.md)
- [Software Architecture Document](../02-architecture/Software-Architecture-Document.md)
- [Architecture Principles](../02-architecture/Architecture-Principles.md)
- [High-Level Architecture](../02-architecture/High-Level-Architecture.md)
