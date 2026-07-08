# Release Notes — VSP Phone v4.0.0 RC1

| Field | Value |
|-------|-------|
| **Version** | 4.0.0-rc1 |
| **Release date** | 2026-07-08 |
| **Release owner** | VSP Platform Engineering |
| **Build timestamp** | 2026-07-08T18:35:21Z (RC1 audit environment) |
| **Git commit** | *Not available — repository not under git in audit environment* |
| **Health mode** | `remediation-complete` |

---

## Overview

**VSP Phone v4.0.0 RC1** is the first release candidate of the enterprise UCaaS platform following completion of Phases 0–20 and the Engineering Remediation Sprint. This RC is intended for **staging deployment and operational acceptance testing** prior to production pilot cutover.

Engineering is **complete and frozen**. No new features, schema changes, or architectural modifications are included in RC1.

---

## Implemented features

### Core telephony
- SIP registration and digest authentication (RFC 2617)
- Internal extension-to-extension routing
- Inbound/outbound PSTN via Telnyx carrier integration
- RTPengine media anchoring (offer/answer, NAT traversal)
- CallSession lifecycle and correlation
- Tenant isolation and cross-tenant rejection

### Enterprise PBX applications
- Queue, IVR, Conference, Voicemail, Park
- Paging, Intercom, Ring groups, Hunt groups
- Supervisor monitor / whisper / barge
- Call pickup and park slots
- Kamailio APP_MEDIA relay and `/routing/continue` mid-call progression

### Client channels
- WebRTC browser enrollment and softphone (Admin UI)
- Grandstream desk phone provisioning (HTTPS edge)
- BLF and presence foundation

### Enterprise platform
- JWT authentication with refresh tokens and account lockout
- RBAC (`PermissionsGuard`) on admin APIs
- Telecom service authentication (`X-VSP-Service-Auth`)
- Rate limiting (auth, telecom, WebRTC, admin, provisioning)
- Security headers, log redaction, config export
- High availability: cluster node registries, graceful shutdown, readiness gates
- Backup orchestration hooks (PostgreSQL, Redis persistence verification)
- Observability: structured logging, metrics, audit trail, call inspector
- Migration toolkit (validate, dry-run, Redis staging, optional production import)
- Production cutover orchestration (readiness, smoke tests, rollback planning)

---

## Architecture summary

```
Clients (SIP phones, WebRTC, PSTN)
        │
        ▼
   Kamailio (SIP signaling, TLS/WSS, service auth to API)
        │
        ├──► NestJS API (routing, call apps, auth, provisioning)
        │         ├── PostgreSQL (Prisma — frozen schema)
        │         └── Redis (sessions, presence, HA markers)
        │
        └──► RTPengine (media anchoring)
                    │
                    └── Telnyx (PSTN carrier)
```

Monorepo: Nx 23, NestJS 11 API, Next.js 16 Admin, Docker Compose stack.

---

## Supported capabilities (RC1 scope)

| Capability | Status |
|------------|--------|
| SIP registration | ✅ |
| Extension dialing | ✅ |
| PSTN inbound/outbound | ✅ |
| WebRTC browser client | ✅ |
| Grandstream provisioning | ✅ |
| Queue / IVR / Conference / Park (API + Kamailio) | ✅ |
| Recording policy & metadata | ✅ (media capture deferred) |
| Presence / BLF foundation | ✅ |
| Multi-tenant isolation | ✅ |
| Migration validation & import | ✅ |
| Production cutover tooling | ✅ |

---

## Deployment requirements

### Minimum infrastructure
- PostgreSQL 16+
- Redis 7+ with AOF or RDB persistence
- Kamailio (Docker image provided)
- RTPengine (Docker image provided)
- TLS certificates for API, SIP, WSS, provisioning edge

### Required production environment variables
- `VSP_ENV=production`
- `JWT_SECRET`, `TELECOM_SERVICE_AUTH_TOKEN`, `TELNYX_WEBHOOK_SECRET`
- `TLS_ENABLED=true` with cert/key paths
- `SECURITY_ENFORCE_TELECOM=true` (production default)
- `BACKUP_LOCATION` (+ optional `BACKUP_POSTGRES_HOOK_CMD`)
- `KAMAILIO_REQUIRE_SERVICE_AUTH=true`
- `KAMAILIO_USRLOC_PERSISTENCE=postgres` (recommended)

See [FINAL_DEPLOYMENT_CHECKLIST.md](../11-final-audit/FINAL_DEPLOYMENT_CHECKLIST.md) and [RC1_CHECKLIST.md](./RC1_CHECKLIST.md).

---

## Known limitations (RC1)

1. **Recording media capture** — Policy and metadata complete; RTPengine-side recording not active.
2. **SIP REFER transfer** — Not implemented.
3. **Device telecom endpoint** — Returns `placeholder: true` (contract stub).
4. **Migration production import** — Tenant and queue entities only; other entities via Redis staging.
5. **Monitoring stack** — No bundled Grafana/Loki/Alertmanager deployment.
6. **Read replica** — Probed in HA health; not used for query routing.
7. **Empty domain module stubs** — Prisma schema complete; some NestJS modules are placeholders.

Full list: [FINDINGS_MATRIX.md](../11-final-audit/FINDINGS_MATRIX.md) (Deferred / Accepted Risk items).

---

## Deferred items (post-RC1)

- OpenTelemetry / Jaeger distributed tracing
- Centralized logging stack deployment (Loki/Grafana)
- Read replica query routing
- Migration import for full entity catalog
- Consolidated troubleshooting guide
- Update stale `KNOWN_LIMITATIONS.md`
- Fix `packages/config` and `packages/logger` TypeScript build (TS4111)
- Align root `package.json` version to `4.0.0-rc1`

---

## Upgrade notes

RC1 is the **first release candidate**. There is no prior v4 production release to upgrade from.

For operators migrating from legacy platforms:
1. Run Phase 19 migration validation (dry-run)
2. Execute Redis staging import
3. Optional production import for tenant/queue (`productionImportConfirm=I_CONFIRM_PRODUCTION_IMPORT`)
4. Complete cutover readiness gate before traffic switch

---

## Operational prerequisites

Before staging deployment:

```bash
npm ci
npm run telecom:validate:remediation   # Must PASS
npx nx build api
npx nx build admin
```

On deployment host:
- Docker available for image build
- TLS certificates provisioned
- Secrets stored in sealed vault (not committed)
- Super Admin role assigned to operators only
- `MIGRATION_DEV_SUPER_ADMIN=false` in production

---

## Validation status (RC1 audit)

| Check | Result |
|-------|--------|
| `npm ci` | ✅ PASS |
| API build | ✅ PASS |
| Admin build | ✅ PASS |
| Full monorepo build | ❌ FAIL (config/logger TS4111) |
| Lint | ✅ PASS |
| `telecom:validate:remediation` | ✅ PASS |
| `telecom:validate:phase20` | ✅ PASS |

See [QUALITY_GATE.md](./QUALITY_GATE.md) for final RC1 disposition.

---

## Related documents

- [RC1_CHECKLIST.md](./RC1_CHECKLIST.md)
- [BUILD_REPORT.md](./BUILD_REPORT.md)
- [PRODUCTION_APPROVAL.md](../11-final-audit/PRODUCTION_APPROVAL.md)
- [FINAL_SIGNOFF.md](./FINAL_SIGNOFF.md)
