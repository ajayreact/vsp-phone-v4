# Security Documentation — VSP Phone v4

| Version | 4.0.0-rc1 |
|---------|-----------|

Security architecture, controls, and operator requirements for RC1.

---

## Security model

VSP Phone v4 uses **three authentication planes**:

| Plane | Mechanism | Consumers |
|-------|-----------|-----------|
| User | JWT (HS256) + refresh tokens | Admin UI, WebRTC enroll |
| SIP | Digest auth (RFC 2617) + credential vault | Desk phones, WebRTC SIP |
| Service | `X-VSP-Service-Auth` shared token | Kamailio, internal automation |

Authorization uses **Prisma RolePermission** RBAC with `PermissionsGuard` on admin APIs.

---

## Production security requirements

| Control | Variable / setting | Required in prod |
|---------|-------------------|----------------|
| JWT signing secret | `JWT_SECRET` | ✅ |
| Telecom service auth | `TELECOM_SERVICE_AUTH_TOKEN` | ✅ |
| Telnyx webhook HMAC | `TELNYX_WEBHOOK_SECRET` | ✅ |
| TLS for API | `TLS_ENABLED=true` | ✅ |
| Telecom tenant enforcement | `SECURITY_ENFORCE_TELECOM=true` | ✅ (default in prod) |
| Kamailio service auth | `KAMAILIO_REQUIRE_SERVICE_AUTH=true` | ✅ |
| Migration dev bypass off | `MIGRATION_DEV_SUPER_ADMIN=false` | ✅ |
| No dev credentials | Remove `DEV_*`, `SIP_DEV_PASSWORD` | ✅ |

Startup validation: `ProductionConfigValidatorService` fail-fast when `VSP_ENV=production`.

---

## Authentication hardening

- Account lockout after failed logins (`AUTH_LOCKOUT_THRESHOLD`)
- Rotating refresh tokens with revocation on logout
- Password policy on change (`PASSWORD_MIN_*`)
- Rate limiting on login/refresh (`AuthRateLimitGuard`)

---

## Authorization (RBAC)

Permission keys (see [API docs](../05-api/README.md)):

- `platform:super_admin` — migration and cutover only
- `provisioning:admin`, `recordings:read`, `presence:read/write` — tenant admin surfaces

Super Admin assignment must be limited to authorized operators.

---

## Tenant isolation

| Layer | Mechanism |
|-------|-----------|
| JWT | `tenantId` in token; passed to all services |
| SIP digest | Endpoint tenant vs assignment tenant — hard deny |
| Routing | Tenant-scoped Prisma queries |
| Redis | Keys prefixed `vsp:{tenantId}:...` |
| Telecom interceptor | Body tenant/line ownership when `SECURITY_ENFORCE_TELECOM=true` |

Cross-tenant calls rejected at routing layer (`TENANT_ISOLATION` plan).

---

## Secret handling

| Secret | Storage |
|--------|---------|
| JWT, service auth, webhook secrets | Environment / sealed vault |
| SIP credentials | `SIP_VAULT_JSON` or Prisma vault service |
| Provisioning MAC credentials | Per-device vault |
| TLS keys | File paths (`TLS_*_FILE`) |

- Config export **never** includes secrets (`secretsExcluded: true`)
- Logs redact passwords, tokens, Bearer headers, PEM blocks
- Dev secrets in `.env.example` are **lab-only**

---

## Security headers

Applied globally via `SecurityHeadersMiddleware`:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- Optional HSTS and CSP when configured

---

## Audit logging

| Service | Events |
|---------|--------|
| `SecurityAuditService` | login, logout, failedLogin, permissionDenied, adminAction |
| `EnterpriseAuditService` | Immutable Redis audit list per tenant |
| Migration/cutover | adminAction on all super-admin operations |

Query: `GET /api/v1/observability/audit` (service auth).

---

## Known security considerations (RC1)

1. **Firmware download** — restrict via network/TLS (see [KNOWN_LIMITATIONS.md](../11-final-audit/KNOWN_LIMITATIONS.md) SL-02)
2. **Dev-open guards** — only when secrets unset; blocked in production validation
3. **Empty domain modules** — identity CRUD via direct DB admin only

Full audit: [SECURITY_AUDIT.md](../11-final-audit/SECURITY_AUDIT.md)

---

## Related documents

- [ADR-007 Authentication & Authorization](../ADR/ADR-007-authentication-authorization.md)
- [ADR-043 SIP credential storage](../ADR/ADR-043-sip-credential-secret-storage.md)
- [API authentication](../05-api/README.md)
- [Deployment security checklist](../07-deployment/README.md)
