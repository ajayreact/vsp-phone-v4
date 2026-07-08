# ADR-007: Authentication and Authorization

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-07-08 |
| **Deciders** | Architecture |
| **Consulted** | — |
| **Informed** | Engineering |

---

## Overview

This ADR records the **approved authentication and authorization architecture** for VSP Phone v4. It defines how users, devices, and API clients authenticate, how access is authorized, and how tenant and site scope is enforced.

These decisions align with:

- [ADR-001](ADR-001-overall-system-architecture.md) — Security First, API First, Multi Tenant
- [ADR-002](ADR-002-tenant-domain-model.md) — Tenant isolation, Users across Sites, RBAC entities
- [ADR-006](ADR-006-database-design.md) — `tenant_id`, audit support
- [Domain Model](../03-database/domain-model.md) — User, Role, Permission

This ADR does **not** define authentication code, token formats, middleware implementation, or API endpoints.

---

## Table of Contents

### Authentication

1. [JWT Access Tokens](#1-jwt-access-tokens)
2. [Refresh Tokens](#2-refresh-tokens)
3. [Secure Password Hashing](#3-secure-password-hashing)
4. [Device-Based Sessions](#4-device-based-sessions)
5. [Session Revocation](#5-session-revocation)
6. [MFA Ready](#6-mfa-ready)
7. [SSO Ready (Future)](#7-sso-ready-future)
8. [OAuth / OpenID Connect Ready](#8-oauth--openid-connect-ready)

### Authorization

9. [Role Based Access Control (RBAC)](#9-role-based-access-control-rbac)
10. [Approved Roles](#10-approved-roles)
11. [Action-Based Permissions](#11-action-based-permissions)

### Rules

12. [Every API Request Is Tenant Scoped](#12-every-api-request-is-tenant-scoped)
13. [Permissions Evaluated Before Business Logic](#13-permissions-evaluated-before-business-logic)
14. [Users May Belong to Multiple Sites](#14-users-may-belong-to-multiple-sites)
15. [Roles May Differ per Site](#15-roles-may-differ-per-site)
16. [API Authentication and SIP Authentication Remain Separate](#16-api-authentication-and-sip-authentication-remain-separate)

17. [Summary](#17-summary)
18. [References](#18-references)

---

## Authentication

## 1. JWT Access Tokens

### Context

The platform requires stateless, scalable API authentication for the NestJS application layer serving web admin, integrations, and future clients. Session tokens must work across horizontally scaled application instances.

### Decision

**JWT Access Tokens are used for API authentication.**

### Reasoning

- Supports stateless authentication aligned with horizontal application scaling ([ADR-006](ADR-006-database-design.md))
- Industry-standard approach for API-first architecture ([ADR-001](ADR-001-overall-system-architecture.md))
- Enables tenant and permission claims to be carried in the token (claim design deferred)
- Compatible with OAuth/OpenID Connect readiness

### Consequences

- API clients authenticate using JWT Access Tokens
- Access tokens have a finite lifetime (duration deferred)
- Token validation occurs on every authenticated API request
- Signing algorithm and key management are deferred to implementation

---

## 2. Refresh Tokens

### Context

Short-lived access tokens improve security but require a mechanism for clients to obtain new access tokens without re-authenticating with credentials on every expiry.

### Decision

**Refresh Tokens are used to renew JWT Access Tokens.**

### Reasoning

- Complements JWT Access Tokens with secure session continuity
- Limits exposure window of access tokens
- Supports session revocation independent of access token expiry
- Standard pattern for web and mobile client authentication

### Consequences

- Clients exchange refresh tokens for new access tokens
- Refresh tokens have a longer lifetime than access tokens (duration deferred)
- Refresh token storage and rotation strategy are deferred to implementation
- Compromised refresh tokens are revocable via Session Revocation

---

## 3. Secure Password Hashing

### Context

Users authenticate with credentials stored in the platform. Passwords must never be stored in plaintext and must resist offline brute-force attacks if the database is compromised.

### Decision

**Passwords are stored using secure password hashing.**

### Reasoning

- Implements **Security First** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Industry baseline for credential storage
- Protects user credentials even if database access is compromised
- Required for password-based authentication flows

### Consequences

- Plaintext passwords are never stored or logged
- Hashing algorithm and work factor selection are deferred to implementation
- Password reset and change flows operate on hashed credentials
- Applies to platform user authentication, not SIP digest credentials

---

## 4. Device-Based Sessions

### Context

Users may have multiple Devices and clients (web admin, softphone, mobile). Sessions must be trackable per device to support revocation, security review, and concurrent session management.

### Decision

**Sessions are device-based.**

### Reasoning

- Aligns with Users may have multiple Devices ([ADR-003](ADR-003-telephony-platform-decisions.md))
- Enables per-device session revocation
- Supports security auditing of active sessions per user and device
- Distinguishes web admin sessions from telephony endpoint sessions

### Consequences

- Each authenticated session is associated with a device or client identity
- Session records support revocation per device
- Multiple concurrent sessions per user are permitted across devices
- Device session model details are deferred to implementation

---

## 5. Session Revocation

### Context

Compromised credentials, administrative lockouts, and user-initiated sign-out require the ability to invalidate active sessions without waiting for token expiry.

### Decision

**Session revocation is supported.**

### Reasoning

- Required for enterprise security and incident response
- Complements refresh token architecture
- Supports administrative user lockout within a Tenant
- Aligns with audit and compliance requirements ([ADR-006](ADR-006-database-design.md))

### Consequences

- Revoked sessions cannot obtain new access tokens
- Revocation may be per-session, per-device, or per-user (scope deferred)
- Revocation state must be checkable at token refresh and optionally at API request (details deferred)
- Revocation events are auditable

---

## 6. MFA Ready

### Context

Enterprise customers require multi-factor authentication for privileged accounts and compliance-driven security policies.

### Decision

**The authentication architecture is MFA ready.**

### Reasoning

- Supports **Security First** principle and enterprise customer requirements
- MFA is increasingly required for UCaaS admin and privileged operations
- Architecture accommodates MFA without requiring immediate implementation
- Aligns with SSO and OAuth/OIDC readiness

### Consequences

- Authentication flows are designed to accommodate an MFA step
- MFA is not required at initial launch (enforcement deferred)
- MFA methods (TOTP, SMS, hardware key) are deferred to future ADRs
- MFA state is part of the authentication model, not an afterthought

---

## 7. SSO Ready (Future)

### Context

Enterprise customers commonly require Single Sign-On integration with corporate identity providers (Azure AD, Okta, Google Workspace).

### Decision

**The authentication architecture is SSO ready for future implementation.**

### Reasoning

- Enterprise UCaaS customers expect SSO for admin and user access
- SSO readiness avoids rework of the authentication model at enterprise sales
- Complements OAuth/OpenID Connect readiness
- Implementation is explicitly deferred to a future phase

### Consequences

- Password-based authentication is the initial path; SSO is a future addition
- Authentication model does not preclude federated identity
- SSO provider integration details are deferred to future ADRs
- Tenant-level SSO configuration is anticipated but not defined here

---

## 8. OAuth / OpenID Connect Ready

### Context

API-first architecture and third-party integrations require standard authorization frameworks. OAuth 2.0 and OpenID Connect are the industry standards for delegated authorization and federated authentication.

### Decision

**The authentication architecture is OAuth 2.0 and OpenID Connect ready.**

### Reasoning

- Supports API First and integration ecosystem goals ([ADR-001](ADR-001-overall-system-architecture.md))
- Enables future SSO via OIDC identity providers
- Standard framework for third-party application access to tenant APIs
- Complements JWT Access Token decision

### Consequences

- OAuth/OIDC flows are not implemented at initial launch
- Authentication model accommodates OIDC token exchange and claims mapping
- OAuth scopes may align with action-based permissions (mapping deferred)
- Provider registration and consent flows are deferred to future ADRs

---

## Authorization

## 9. Role Based Access Control (RBAC)

### Context

Multi-tenant platforms require fine-grained access control across diverse user types — platform operators, tenant administrators, supervisors, agents, and auditors. Ad-hoc permission checks do not scale across modules and tenants.

### Decision

**Authorization uses Role Based Access Control (RBAC).**

### Reasoning

- Approved in the domain model — Role and Permission entities ([Domain Model](../03-database/domain-model.md))
- Approved in [ADR-002](ADR-002-tenant-domain-model.md) — permissions use RBAC
- Standard enterprise authorization model for UCaaS platforms
- Separates role assignment from permission definition for maintainability

### Consequences

- Users receive permissions through Role assignments
- Roles aggregate Permissions within Tenant scope
- Permission checks reference Role-Permission mappings
- RBAC is enforced at the API layer before business logic (see Rule 13)

---

## 10. Approved Roles

### Context

VSP Phone v4 serves multiple user personas with distinct operational responsibilities. A defined role catalog prevents ad-hoc role creation and ensures consistent authorization across tenants.

### Decision

The following roles are **approved**:

| Role | Scope |
|------|-------|
| **Platform Admin** | Platform-wide administration |
| **Tenant Admin** | Full administration within a Tenant |
| **Site Manager** | Administration within assigned Site(s) |
| **Supervisor** | Team oversight, queue and call monitoring |
| **Agent** | Standard contact center agent operations |
| **Receptionist** | Call handling and front-desk operations |
| **Billing Admin** | Billing and usage administration |
| **Provisioning Admin** | User, device, and number provisioning |
| **Auditor** | Read access to audit and compliance data |
| **Read Only** | View-only access within assigned scope |

No additional roles are approved beyond this list without a new ADR.

### Reasoning

- Covers platform operator, tenant administrator, and operational personas
- Aligns with approved domain modules (billing, provisioning, audit, queue, call)
- Supports site-scoped and tenant-scoped administration models
- Provides a baseline role catalog for RBAC implementation

### Consequences

- Role definitions are seeded or configured from this approved catalog
- Custom tenant-defined roles beyond this list require a future ADR
- Role-Permission mappings are defined per role (mapping deferred)
- Platform Admin operates outside single-tenant scope; all other roles are tenant-scoped

---

## 11. Action-Based Permissions

### Context

RBAC requires atomic, testable permission definitions. Resource-action permissions provide clear authorization checks that map directly to API operations and admin UI capabilities.

### Decision

**Permissions are action-based**, using the format `resource:action`.

Approved permission examples:

| Permission | Description |
|------------|-------------|
| `users:create` | Create users |
| `users:update` | Update users |
| `users:delete` | Delete users |
| `devices:update` | Update devices |
| `calls:view` | View call records |
| `calls:record` | Initiate or manage call recording |
| `numbers:assign` | Assign phone numbers |
| `billing:view` | View billing data |

Additional permissions follow the same `resource:action` format. The full permission catalog is defined during implementation; only the format and examples above are approved here.

### Reasoning

- Action-based permissions map directly to API endpoints and UI actions
- Supports API First authorization design
- Enables fine-grained RBAC without role explosion
- Consistent naming convention across all modules

### Consequences

- All authorization checks use `resource:action` permission strings
- Roles aggregate sets of action-based permissions
- Permission catalog expansion follows the same naming convention
- Full permission catalog per module is deferred to implementation

---

## Rules

## 12. Every API Request Is Tenant Scoped

### Context

Multi-tenant isolation requires that every API operation is executed within an authenticated Tenant context. Cross-tenant data access is a critical security failure.

### Decision

**Every API request is tenant scoped.**

### Reasoning

- Implements **Multi Tenant** architecture principle ([ADR-001](ADR-001-overall-system-architecture.md))
- Aligns with `tenant_id` on every business entity ([ADR-002](ADR-002-tenant-domain-model.md), [ADR-006](ADR-006-database-design.md))
- Prevents cross-tenant data leakage at the API layer
- Tenant context is derived from authentication, not client-supplied parameters alone

### Consequences

- Authenticated API requests carry or resolve Tenant context
- Database queries include `tenant_id` from authenticated context
- Platform Admin requests explicitly target a Tenant or platform scope
- Tenant resolution mechanism is deferred to implementation

---

## 13. Permissions Evaluated Before Business Logic

### Context

Authorization checks that occur after business logic has started risk partial side effects, data exposure, and inconsistent enforcement across modules.

### Decision

**Permissions are evaluated before business logic executes.**

### Reasoning

- Implements **Security First** principle
- Prevents unauthorized operations from reaching domain services
- Ensures consistent enforcement across all NestJS modules
- Supports fail-fast authorization in the API layer

### Consequences

- Authorization is enforced in a guard or middleware layer before controllers/services
- Unauthorized requests return an error without executing business logic
- Permission checks reference the action-based permission catalog
- No module may bypass pre-business-logic authorization

---

## 14. Users May Belong to Multiple Sites

### Context

Users within a customer organization may work across multiple locations or business units. Authorization must reflect site membership without requiring duplicate user accounts.

### Decision

**Users may belong to multiple Sites within their Tenant.**

### Reasoning

- Approved in [ADR-002](ADR-002-tenant-domain-model.md)
- Supports multi-site enterprise operating models
- Enables site-scoped roles and permissions (see Rule 15)
- Avoids duplicate User records for multi-site workers

### Consequences

- User–Site membership is many-to-many within a Tenant
- Authorization resolves Site context from membership and role assignment
- Site-scoped operations validate User membership in the target Site
- Site context resolution mechanism is deferred to implementation

---

## 15. Roles May Differ per Site

### Context

A User who belongs to multiple Sites may hold different responsibilities at each Site — for example, Site Manager at one location and Agent at another.

### Decision

**Roles may differ per Site for the same User.**

### Reasoning

- Reflects real-world enterprise role assignments across locations
- Complements Users may belong to multiple Sites
- Enables Site Manager and Agent roles to be site-specific
- Supports fine-grained authorization without multiple User accounts

### Consequences

- Role assignment is scoped to User + Site (and Tenant)
- A User may hold different Roles at different Sites within the same Tenant
- Permission evaluation considers Site-scoped Role assignments
- Tenant-wide roles (e.g., Tenant Admin) apply across all Sites in the Tenant

---

## 16. API Authentication and SIP Authentication Remain Separate

### Context

VSP Phone v4 has two distinct authentication domains: the NestJS API layer (web admin, integrations) and the SIP signaling layer (Kamailio, device registration, call setup). Conflating these creates security and operational coupling.

### Decision

**API authentication and SIP authentication remain separate.**

### Reasoning

- API authentication (JWT) and SIP authentication (digest/TLS) serve different protocols and clients
- Kamailio handles SIP signaling authentication independently ([Kamailio Architecture](../04-telecom/kamailio-architecture.md))
- Approved in Kamailio ADR context — SIP authentication flow is a separate concern
- Prevents coupling platform user credentials to SIP endpoint credentials

### Consequences

- Platform User credentials authenticate API requests only
- SIP Device credentials authenticate SIP registration and signaling only
- Correlation between API User and SIP Device is via domain model, not shared credentials
- SIP authentication mechanism details remain in telecom architecture ADRs

---

## 17. Summary

### Authentication

| Decision | Status |
|----------|--------|
| JWT Access Tokens | Approved |
| Refresh Tokens | Approved |
| Secure password hashing | Approved |
| Device-based sessions | Approved |
| Session revocation | Approved |
| MFA ready | Approved |
| SSO ready | Future |
| OAuth/OIDC ready | Approved |

### Authorization

| Decision | Value |
|----------|-------|
| Model | RBAC |
| Permission format | `resource:action` |

### Approved Roles

Platform Admin, Tenant Admin, Site Manager, Supervisor, Agent, Receptionist, Billing Admin, Provisioning Admin, Auditor, Read Only

### Rules

| Rule | Value |
|------|-------|
| API tenant scoping | Every request |
| Permission evaluation | Before business logic |
| Multi-site users | Supported |
| Site-scoped roles | Supported |
| API vs SIP auth | Separate |

---

## 18. References

- [ADR-001: Overall System Architecture](ADR-001-overall-system-architecture.md)
- [ADR-002: Tenant Domain Model](ADR-002-tenant-domain-model.md)
- [ADR-006: Database Design](ADR-006-database-design.md)
- [Domain Model](../03-database/domain-model.md)
- [Kamailio Architecture](../04-telecom/kamailio-architecture.md)
- [ADR Index](./README.md)
