# ADR-013: API Standards

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved API standards** for VSP Phone v4. It defines API architecture, data conventions, authentication, error handling, pagination, filtering, validation, security, and documentation requirements.

These decisions align with:

- [ADR-001](ADR-001-overall-system-architecture.md) — API First Design, NestJS
- [ADR-006](ADR-006-database-design.md) — UUID primary keys, UTC timestamps
- [ADR-007](ADR-007-authentication-authorization.md) — JWT, tenant-scoped requests, permissions before business logic

This ADR does **not** define API endpoints, request/response schemas, or implementation code.

---

## Table of Contents

### Architecture

1. [REST APIs](#1-rest-apis)
2. [OpenAPI](#2-openapi)
3. [Swagger](#3-swagger)
4. [Versioned APIs](#4-versioned-apis)

### Standards

5. [API Path Prefix — /api/v1/](#5-api-path-prefix--apiv1)
6. [JSON Only](#6-json-only)
7. [UUID Identifiers](#7-uuid-identifiers)
8. [ISO-8601 UTC Timestamps](#8-iso-8601-utc-timestamps)

### Authentication

9. [JWT Authentication](#9-jwt-authentication)
10. [Bearer Tokens](#10-bearer-tokens)

### Request and Response Patterns

11. [Consistent Error Format](#11-consistent-error-format)
12. [Cursor-Based Pagination](#12-cursor-based-pagination)
13. [Tenant-Scoped Filtering](#13-tenant-scoped-filtering)
14. [Standard Query Parameters for Sorting](#14-standard-query-parameters-for-sorting)

### Validation and Security

15. [NestJS Validation Pipes](#15-nestjs-validation-pipes)
16. [Rate Limiting](#16-rate-limiting)
17. [Request IDs](#17-request-ids)
18. [Correlation IDs](#18-correlation-ids)
19. [Idempotency Support](#19-idempotency-support)

### Documentation

20. [OpenAPI Generated Automatically](#20-openapi-generated-automatically)

21. [Summary](#21-summary)
22. [References](#22-references)

---

## 1. REST APIs

### Context

VSP Phone v4 requires a standardized HTTP API for the admin portal, mobile clients, integrations, and third-party consumers. The API style must support CRUD operations, predictable conventions, and broad client compatibility.

### Decision

**VSP Phone v4 APIs use REST.**

### Reasoning

- Implements **API First Design** architecture style ([ADR-001](ADR-001-overall-system-architecture.md))
- Industry-standard approach for enterprise SaaS and UCaaS platforms
- Compatible with OpenAPI specification and Swagger documentation
- Well-supported by NestJS application framework

### Consequences

- All platform HTTP APIs follow REST conventions
- Resources are addressed via HTTP methods and URI paths
- GraphQL and gRPC are not approved for primary public API without a new ADR
- REST resource naming conventions are deferred to implementation guidelines

---

## 2. OpenAPI

### Context

API consumers, internal teams, and integration partners require a machine-readable API contract. OpenAPI is the industry standard for REST API specification.

### Decision

**OpenAPI is the approved API specification format.**

### Reasoning

- Supports API First design with contract-driven development
- Enables automatic documentation generation
- Standard format for client SDK generation and integration tooling
- Widely adopted across enterprise API ecosystems

### Consequences

- API contracts are expressed in OpenAPI format
- OpenAPI specification is the authoritative API contract document
- Breaking changes require OpenAPI version updates
- OpenAPI schema generation approach is deferred to implementation

---

## 3. Swagger

### Context

Developers and integrators require interactive API documentation for exploration and testing during development and integration.

### Decision

**Swagger is used for API documentation UI.**

### Reasoning

- Standard UI for OpenAPI specifications
- Supports interactive API exploration in development environments
- NestJS ecosystem has established Swagger integration patterns
- Complements OpenAPI as specification format

### Consequences

- Swagger UI is available for API documentation and exploration
- Swagger is a documentation tool; OpenAPI remains the contract format
- Swagger exposure in production is a deployment configuration concern (deferred)

---

## 4. Versioned APIs

### Context

API evolution requires backward-compatible change management. Unversioned APIs create breaking change risk for existing clients and integrations.

### Decision

**APIs are versioned.**

### Reasoning

- Supports safe API evolution without breaking existing clients
- Standard practice for enterprise SaaS platforms
- Enables parallel operation of multiple API versions during migration
- Complements `/api/v1/` path prefix standard

### Consequences

- Current approved version is `v1`
- Breaking changes require a new API version (e.g., `v2`)
- Version is included in the API path prefix
- Version deprecation policy is deferred to future ADRs

---

## 5. API Path Prefix — /api/v1/

### Context

All platform HTTP APIs require a consistent, predictable base path that includes versioning and distinguishes API routes from other application routes.

### Decision

**All APIs use the `/api/v1/` path prefix.**

### Reasoning

- Establishes consistent API namespace across all modules
- Embeds version in path per versioned APIs decision
- Aligns with existing NestJS bootstrap global prefix convention
- Clear separation from non-API routes (health checks, documentation)

### Consequences

- All REST endpoints are served under `/api/v1/`
- Future versions use `/api/v2/`, etc.
- Path structure within v1 is deferred to module implementation
- No endpoint paths are defined in this ADR

---

## 6. JSON Only

### Context

API request and response formats must be consistent across all clients and modules. Multiple content types increase client complexity and testing burden.

### Decision

**APIs accept and return JSON only.**

### Reasoning

- Universal support across web, mobile, and integration clients
- Standard format for OpenAPI specification
- Simplifies validation, serialization, and error handling
- Aligns with NestJS default JSON handling

### Consequences

- `Content-Type: application/json` for request and response bodies
- Non-JSON request bodies are rejected
- File upload APIs (if any) require a separate ADR
- XML, form-encoded, and multipart are not approved for standard APIs

---

## 7. UUID Identifiers

### Context

Platform entities use UUID primary keys in the database ([ADR-006](ADR-006-database-design.md)). API resource identifiers must align with persistence layer identifiers.

### Decision

**API resource identifiers are UUIDs.**

### Reasoning

- Aligns with UUID primary keys in database architecture ([ADR-006](ADR-006-database-design.md))
- Aligns with Platform UUID for calls ([ADR-004](ADR-004-call-architecture.md))
- Application-generated UUIDs are consistent across API and database ([ADR-006](ADR-006-database-design.md))
- Prevents enumeration attacks associated with sequential integer IDs

### Consequences

- All resource IDs in API paths and response bodies are UUID format
- Clients must handle UUID strings as resource identifiers
- UUID version and string format are deferred to implementation
- Integer surrogate keys are not exposed in APIs

---

## 8. ISO-8601 UTC Timestamps

### Context

APIs must represent timestamps consistently across all clients and time zones. Database timestamps are stored in UTC ([ADR-006](ADR-006-database-design.md)).

### Decision

**API timestamps use ISO-8601 format in UTC.**

### Reasoning

- Aligns with UTC timestamp storage in database ([ADR-006](ADR-006-database-design.md))
- ISO-8601 is the universal standard for API timestamp serialization
- Unambiguous across client time zones
- Native support in JavaScript, mobile SDKs, and OpenAPI schema types

### Consequences

- All timestamp fields in API responses use ISO-8601 UTC format
- Clients convert to local time for display only
- Timezone offsets in API timestamps are not permitted
- Specific field naming for timestamps is deferred to schema design

---

## 9. JWT Authentication

### Context

API authentication must be stateless, scalable, and compatible with horizontal application scaling ([ADR-006](ADR-006-database-design.md)).

### Decision

**API authentication uses JWT.**

### Reasoning

- Approved in [ADR-007](ADR-007-authentication-authorization.md) — JWT Access Tokens
- Stateless authentication supports horizontally scaled NestJS instances
- Supports tenant and permission claims in token payload (claims deferred)
- Complements OAuth/OIDC readiness ([ADR-007](ADR-007-authentication-authorization.md))

### Consequences

- Authenticated API requests include a valid JWT Access Token
- Token validation occurs on every protected API request
- JWT signing and claim schema are deferred to implementation
- API JWT is separate from SIP authentication ([ADR-007](ADR-007-authentication-authorization.md))

---

## 10. Bearer Tokens

### Context

JWT Access Tokens must be transmitted in a standard, well-understood HTTP authentication scheme recognized by clients, proxies, and API gateways.

### Decision

**JWT Access Tokens are transmitted as Bearer Tokens.**

### Reasoning

- RFC 6750 Bearer Token is the standard HTTP authentication scheme for JWT APIs
- Universally supported by HTTP clients, mobile SDKs, and API tools
- Compatible with Swagger authorization UI
- Standard pattern for OpenAPI security schemes

### Consequences

- Authenticated requests include `Authorization: Bearer <token>` header
- API gateways and middleware validate Bearer token presence and format
- Token in query parameters or cookies is not approved for API authentication
- Refresh token transmission mechanism is deferred to implementation

---

## 11. Consistent Error Format

### Context

API consumers require predictable error responses across all endpoints and modules to build reliable error handling and user-facing error display.

### Decision

**All API errors use a consistent error format.**

### Reasoning

- Supports API First design with predictable client integration
- Reduces client-side error handling complexity
- Enables centralized error logging and monitoring
- Standard practice for enterprise API platforms

### Consequences

- All error responses across all modules follow the same structure
- HTTP status codes are used semantically alongside the error body
- Specific error field names and error code catalog are deferred to implementation
- No endpoint-specific error formats are permitted

---

## 12. Cursor-Based Pagination

### Context

List endpoints returning tenant-scoped collections (calls, devices, users) must paginate efficiently at scale without offset-based performance degradation.

### Decision

**API pagination uses cursor-based pagination.**

### Reasoning

- Performs consistently at large dataset sizes (millions of call records) ([ADR-006](ADR-006-database-design.md))
- Avoids offset pagination performance degradation on large tables
- Stable results when data changes between page requests
- Standard pattern for high-volume SaaS list APIs

### Consequences

- List endpoints return a cursor for the next page
- Offset/limit pagination is not approved for standard list endpoints
- Cursor encoding and request parameters are deferred to implementation
- Page size limits are deferred to implementation

---

## 13. Tenant-Scoped Filtering

### Context

All business data is tenant-scoped ([ADR-002](ADR-002-tenant-domain-model.md)). API list and query operations must enforce tenant isolation in filtering.

### Decision

**API filtering is tenant scoped.**

### Reasoning

- Implements every API request is tenant scoped ([ADR-007](ADR-007-authentication-authorization.md))
- Aligns with `tenant_id` on every business entity ([ADR-006](ADR-006-database-design.md))
- Prevents cross-tenant data exposure through filter parameters
- Tenant context is derived from authentication, not client-supplied filter alone

### Consequences

- All list and query operations implicitly filter by authenticated Tenant
- Clients cannot request data from other Tenants via filter parameters
- Platform Admin cross-tenant queries require explicit scope (deferred)
- Additional filter parameters operate within tenant scope only

---

## 14. Standard Query Parameters for Sorting

### Context

List endpoints require consistent sorting behavior across all modules. Ad-hoc per-endpoint sort parameters create client integration inconsistency.

### Decision

**API sorting uses standard query parameters.**

### Reasoning

- Consistent sort interface across all list endpoints
- Predictable for API consumers and OpenAPI documentation
- Reduces per-module sort parameter proliferation
- Supports admin portal and integration client development

### Consequences

- All sortable list endpoints use the same query parameter names
- Specific parameter names and allowed sort fields are deferred to implementation
- Default sort order per endpoint is deferred to implementation
- Sort direction (ascending/descending) uses standard parameter convention (deferred)

---

## 15. NestJS Validation Pipes

### Context

API input validation must be enforced consistently across all endpoints before business logic executes, aligned with permissions-before-business-logic rule ([ADR-007](ADR-007-authentication-authorization.md)).

### Decision

**API input validation uses NestJS Validation Pipes.**

### Reasoning

- NestJS is the approved application framework ([ADR-001](ADR-001-overall-system-architecture.md))
- Validation Pipes enforce input validation before controller business logic
- Integrates with class-validator and class-transformer ecosystem
- Complements permissions evaluated before business logic ([ADR-007](ADR-007-authentication-authorization.md))

### Consequences

- All API endpoints use NestJS Validation Pipes for request validation
- Invalid requests are rejected before business logic with consistent error format
- DTO classes define validation rules per endpoint (deferred to implementation)
- Validation error responses use the consistent error format

---

## 16. Rate Limiting

### Context

Public and authenticated APIs are subject to abuse, accidental overload, and denial-of-service attempts. Rate limiting protects platform stability.

### Decision

**API rate limiting is enforced.**

### Reasoning

- Implements **Security First** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Protects horizontally scaled application layer from request floods
- Complements SIP rate limiting at Kamailio layer ([ADR-008](ADR-008-kamailio-architecture.md))
- Standard enterprise API security control

### Consequences

- API requests are subject to rate limits
- Rate limit thresholds per client, tenant, and endpoint are deferred
- Rate limit exceeded responses use consistent error format
- Rate limiting may be enforced at API gateway or application layer (deferred)

---

## 17. Request IDs

### Context

Distributed request tracing and support troubleshooting require a unique identifier per API request.

### Decision

**Every API request includes a Request ID.**

### Reasoning

- Enables per-request log correlation across NestJS modules
- Supports customer support and incident investigation
- Standard observability practice for enterprise APIs
- Complements correlation IDs for cross-service tracing

### Consequences

- Each API request is assigned a unique Request ID
- Request ID is included in response headers and log entries
- Request ID header name is deferred to implementation
- Clients may supply a Request ID or receive a server-generated one (deferred)

---

## 18. Correlation IDs

### Context

A single user action may trigger multiple internal operations across modules, events, and external systems. Correlation IDs link related operations across service boundaries.

### Decision

**Correlation IDs are supported for API requests.**

### Reasoning

- Supports event-driven internal architecture ([ADR-001](ADR-001-overall-system-architecture.md))
- Links API requests to downstream domain events and audit records
- Enables end-to-end tracing across NestJS, Kamailio integration, and Carrier Adapter
- Standard distributed systems observability practice

### Consequences

- Correlation ID propagates from API request through internal operations
- Correlation ID is included in logs, events, and audit records
- Relationship between Request ID and Correlation ID is deferred to implementation
- Correlation ID header name and propagation rules are deferred

---

## 19. Idempotency Support

### Context

Network failures and client retries can cause duplicate API operations — duplicate provisioning, duplicate number assignment, duplicate call commands. Idempotency keys prevent unintended duplicate side effects.

### Decision

**API idempotency is supported.**

### Reasoning

- Critical for reliable integrations and mobile clients with retry behavior
- Standard enterprise API pattern for non-idempotent operations
- Supports safe client retry without duplicate resource creation
- Aligns with application-generated UUIDs and event-driven architecture

### Consequences

- Mutating API endpoints support idempotency keys for safe retry
- Idempotency key scope and TTL are deferred to implementation
- Idempotent operations return the same response on duplicate requests
- Which endpoints require idempotency keys is deferred to API design

---

## 20. OpenAPI Generated Automatically

### Context

Manual OpenAPI maintenance diverges from implementation over time. Automatic generation ensures documentation reflects the actual API.

### Decision

**OpenAPI specification is generated automatically from the NestJS application.**

### Reasoning

- Eliminates documentation drift between code and OpenAPI spec
- NestJS supports automatic OpenAPI generation via decorators
- Complements Swagger UI for interactive documentation
- Supports API First design with code as source of truth

### Consequences

- OpenAPI spec is generated at build or runtime from NestJS controllers and DTOs
- Manual OpenAPI editing is not the primary specification workflow
- Generated spec is published alongside Swagger UI
- Generation tooling and publish pipeline are deferred to implementation

---

## 21. Summary

### Architecture

REST APIs, OpenAPI, Swagger, Versioned APIs

### Standards

| Standard | Value |
|----------|-------|
| Path prefix | `/api/v1/` |
| Content type | JSON only |
| Identifiers | UUID |
| Timestamps | ISO-8601 UTC |

### Authentication

JWT via Bearer Token

### Patterns

| Pattern | Approach |
|---------|----------|
| Errors | Consistent format |
| Pagination | Cursor-based |
| Filtering | Tenant scoped |
| Sorting | Standard query parameters |
| Validation | NestJS Validation Pipes |

### Security

Rate limiting, Request IDs, Correlation IDs, Idempotency support

### Documentation

OpenAPI generated automatically

---

## 22. References

- [ADR-001: Overall System Architecture](ADR-001-overall-system-architecture.md)
- [ADR-006: Database Design](ADR-006-database-design.md)
- [ADR-007: Authentication and Authorization](ADR-007-authentication-authorization.md)
- [ADR Index](./README.md)
