# Security Audit — VSP Phone v4

| Field | Value |
|-------|-------|
| **Document ID** | AUDIT-003 |
| **Date** | 2026-07-08 |
| **Scope** | Authentication, authorization, secrets, tenant isolation |

---

## Security rating: B- (Strong foundations; enforcement gaps in production path)

---

## Authentication

### User plane (browser/admin)

| Component | Path | Assessment |
|-----------|------|------------|
| JWT access tokens | `auth/jwt.util.ts` — HS256 custom implementation | Functional; requires secret rotation discipline |
| Login | `auth/auth.service.ts` — `login()` | Rate limited via `AuthRateLimitGuard` |
| Refresh tokens | `enterprise-security/auth/refresh-token.service.ts` | Rotating refresh token store |
| Session revocation | `auth-hardening.service.ts` — `isSessionRevoked()` | On logout and lockout |
| Account lockout | `auth-hardening.service.ts` — `assertNotLocked()` | Brute-force protection |
| Password policy | `password-policy.service.ts` | Enforced on password change |

### SIP plane (devices/WebRTC)

| Component | Path | Assessment |
|-----------|------|------------|
| Digest auth | `sip-digest-auth.service.ts` | RFC 2617 compliant; HA1 from vault |
| Credential vault | `sip-credential-vault.service.ts` (ADR-043) | Env/vault-backed; dev password isolated |
| WebRTC enroll | `webrtc-enroll.service.ts` | Short-lived credentials; JWT-gated |

### Service plane (Kamailio → NestJS)

| Component | Path | Assessment |
|-----------|------|------------|
| Service auth guard | `telecom-service-auth.guard.ts` | Token comparison on `X-VSP-Service-Auth` |
| **Kamailio config** | `infrastructure/kamailio/kamailio.cfg` | **Does not send service auth header** |

**Critical finding:** Production startup validation requires `TELECOM_SERVICE_AUTH_TOKEN`. When set, Kamailio HTTP calls will fail authentication unless infrastructure is updated externally. Guard allows all requests when token unset (dev mode).

---

## Authorization

### RBAC infrastructure

| Component | Path | Status |
|-----------|------|--------|
| Permissions service | `permissions.service.ts` — `userHasPermission()` | Implemented (Prisma RolePermission) |
| Permissions guard | `permissions.guard.ts` + `@RequirePermission()` | Defined and exported |
| Super Admin guard | `migration-toolkit/guards/super-admin.guard.ts` | Applied to migration + cutover APIs |
| **Controller usage** | All `apps/api/src` controllers | **`@RequirePermission()` not applied anywhere** |

Admin APIs (provisioning, recording, presence) rely on `JwtAuthGuard` + `user.tenantId` scoping only — **no permission key enforcement**.

### Telecom authorization interceptor

| Setting | Default | Behavior |
|---------|---------|----------|
| `SECURITY_ENFORCE_TELECOM` | `false` | When false, tenant/line ownership checks on POST bodies are skipped |
| `TelecomAuthorizationInterceptor` | Registered globally | Active only when flag enabled |

Kamailio-origin requests can POST routing bodies without validated tenant context when enforcement is off.

---

## Secret handling

| Secret | Storage | Validation |
|--------|---------|------------|
| `JWT_SECRET` | Env | Required in production (`SecretValidationService`) |
| `TELECOM_SERVICE_AUTH_TOKEN` | Env | Required in production |
| `TELNYX_WEBHOOK_SECRET` | Env | Required in production |
| SIP credentials | `SIP_VAULT_JSON` / Prisma | Vault service; never in logs |
| Provisioning MAC creds | `provisioning-vault.service.ts` | Per-device |
| TLS keys | File paths | Validated at cutover readiness |

### Log redaction

- `log-redaction.service.ts` — masks passwords, tokens, Bearer, PEM blocks
- Applied globally in `main.ts` via console logger wrapper
- `SecurityExceptionFilter` strips stack traces (except `/v1/telecom` paths — more detail leaked on telecom errors)

### Config export

- `config-export.service.ts` — whitelist-only env keys; `secretsExcluded: true` always

**Assessment:** Secret handling design is sound. Production validation enforces presence of critical secrets.

---

## Rate limiting

| Guard | Scope | Path |
|-------|-------|------|
| `AuthRateLimitGuard` | Login/refresh | enterprise-security |
| `TelecomRateLimitGuard` | All `/v1/telecom/*` | common/telecom |
| `WebrtcRateLimitGuard` | WebRTC enroll | enterprise-security |
| `AdminRateLimitGuard` | Provisioning admin | enterprise-security |
| `ProvisioningRateLimitGuard` | Prov endpoints | enterprise-security |

Implementation: Redis-backed sliding window in `rate-limit.service.ts`.

**Assessment:** ✅ Comprehensive scope coverage on sensitive endpoints.

---

## Security headers

`security-headers.middleware.ts` applied globally:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` restricted
- Optional CSP and HSTS when configured

**Assessment:** ✅ Adequate for API service.

---

## Tenant isolation

| Layer | Mechanism | Enforced? |
|-------|-----------|-----------|
| JWT | `tenantId` in token payload | Yes — controllers pass to services |
| SIP digest | Assignment tenant vs endpoint tenant | Yes — hard deny |
| Routing | Tenant-scoped line/extension/device queries | Yes |
| Carrier | Trunk/DID filtered by tenantId | Yes |
| Call apps | Prisma queries with tenantFilter | Yes |
| Admin APIs | `user.tenantId` passed to services | Yes |
| Redis keys | Tenant-prefixed (`vsp:{tenantId}:...`) | Yes |
| Telecom interceptor | Body tenant/line ownership | **Opt-in only** |

Cross-tenant call rejection implemented in routing (`TENANT_ISOLATION` reject plan).

**Assessment:** Data-layer isolation is strong. Kamailio-origin request body validation is weak unless `SECURITY_ENFORCE_TELECOM=true`.

---

## Audit logging

| Service | Events |
|---------|--------|
| `SecurityAuditService` | login, logout, failedLogin, permissionDenied, adminAction |
| `EnterpriseAuditService` | Immutable Redis list per tenant (max 5000) |
| Migration/cutover | adminAction on all super-admin operations |

Query: `GET /api/v1/observability/audit` (service auth).

**Assessment:** ✅ Audit trail adequate for compliance baseline. Fire-and-forget async persist — no guaranteed flush on shutdown.

---

## Security findings summary

| ID | Severity | Finding |
|----|----------|---------|
| SEC-01 | **Critical** | Kamailio does not send `X-VSP-Service-Auth` — production token breaks telecom plane |
| SEC-02 | **High** | RBAC `PermissionsGuard` defined but never applied to controllers |
| SEC-03 | **High** | `SECURITY_ENFORCE_TELECOM` defaults false |
| SEC-04 | **Medium** | Telecom error responses may leak more detail than other routes |
| SEC-05 | **Medium** | Firmware download endpoint unauthenticated (catalog lookup only) |
| SEC-06 | **Low** | Custom JWT implementation (not `@nestjs/jwt`) — acceptable with rotation |
| SEC-07 | **Low** | Dev-open telecom guard when token unset — documented, must not reach production |

---

## Security rating summary

| Area | Rating |
|------|--------|
| Authentication | B+ |
| Authorization (RBAC) | C |
| Secret management | A- |
| Rate limiting | A- |
| Tenant isolation | B+ |
| Audit logging | B+ |
| Security headers | A- |
| **Overall security** | **B-** |
