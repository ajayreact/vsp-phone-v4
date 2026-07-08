# Phase 18 — Production Platform & Deployment Readiness (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P18-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 18 Complete (static validation PASS) |
| **Date** | 2026-07-08 |
| **Scope** | Production deployment readiness, config validation, backups, release management |
| **Architecture** | ADR-016 / ADR-017 / ADR-019 — frozen |
| **Constraint** | Phases 1–17 / Prisma / Kamailio / RTPengine / telecom API contracts unchanged |

---

## Production architecture

```text
Application bootstrap
        │
        ├─ validateEnv() — env schema + assertProductionSecurity (Phase 16)
        ├─ SecretValidationService — production secret checks (Phase 16)
        ├─ ProductionConfigValidatorService — profile-aware fail-fast (Phase 18)
        │
        ├─ EnterpriseHaModule — graceful shutdown, HA probes (Phase 17)
        ├─ ProductionPlatformModule — deployment readiness + release APIs
        │
        └─ Runtime
            ├─ GET /api/v1/production/readiness
            ├─ GET /api/v1/production/version
            ├─ GET /api/v1/production/config/export (non-sensitive)
            ├─ POST /api/v1/production/restore/validate (read-only)
            └─ GET /api/v1/production/cicd/readiness
```

No telephony routing, media, or PBX behavior changed.

---

## Modules implemented

| Path | Purpose |
|------|---------|
| `apps/api/src/modules/production-platform/` | Root production platform module |
| `environment/` | Profile resolution (development/testing/staging/production) |
| `configuration/` | Startup validation, config export, secret exclusion |
| `deployment/` | Deployment + CI/CD readiness reports |
| `backups/` | Backup location/schedule validation |
| `restore/` | Restore validation hooks (no data overwrite) |
| `releases/` | Version, git commit, build timestamp |
| `validation/` | Startup validation facade |
| `readiness/` | Production readiness facade |
| `services/` | ProductionPlatformService orchestrator |
| `controllers/production.controller.ts` | `/v1/production/*` APIs |

Wired via `ProductionPlatformModule` in `app.module.ts` (after `EnterpriseHaModule`).

---

## Configuration validation

`ProductionConfigValidatorService` runs at startup (`OnModuleInit`):

| Profile | Fail-fast | Checks |
|---------|-----------|--------|
| **production** | Yes (throws) | JWT, telecom auth, Telnyx webhook, TLS, backup location, DB/Redis, infra probes |
| **staging** | No (warn) | JWT, telecom auth, TLS, DB/Redis, infra probes |
| **testing** | No | Minimal — env presence only |
| **development** | No | Lab-safe defaults |

Validated areas: environment variables, Redis, PostgreSQL, Telnyx (webhook in prod), Kamailio TCP, RTPengine TCP, TLS, JWT.

---

## Deployment readiness

`GET /api/v1/production/readiness` evaluates:

| Component | Source |
|-----------|--------|
| API | Health + not draining |
| Database | PostgreSQL probe |
| Redis | PING |
| Kamailio | TCP health |
| RTPengine | TCP health |
| Carrier | Telnyx adapter health |
| WebRTC | JWT / WSS configuration |
| Provisioning | PROV_HTTPS_ENABLED |
| Configuration | Startup validation result |
| Backup | BACKUP_LOCATION (required in production profile) |

Returns `{ ready: boolean, components: {...} }`.

---

## Release management

`GET /api/v1/production/version` returns:

- `version` / `releaseNumber` — `RELEASE_NUMBER` or `package.json` version
- `gitCommit` — `BUILD_GIT_COMMIT` / `GIT_COMMIT`
- `buildTimestamp` — `BUILD_TIMESTAMP`
- `deploymentEnvironment` — `VSP_ENV`
- `phase` — `phase18-production-platform`

---

## Configuration export

`GET /api/v1/production/config/export` exports non-sensitive configuration:

- Platform settings (whitelist from `EXPORTABLE_ENV_KEYS`)
- Carrier metadata (hosts, dispatcher — **no secrets**)
- Queue / IVR / conference media URIs and timeouts
- Provisioning settings (no credentials)
- Feature codes from Redis `vsp:*:ops:feature:*` (bounded scan)

`secretsExcluded: true` always. Snapshot stored in Redis `vsp:production:config:export`.

---

## Restore validation

`POST /api/v1/production/restore/validate` (read-only):

1. Config snapshot exists in Redis
2. Schema compatibility — `SELECT 1` against PostgreSQL (no migrations)
3. Runtime compatibility — phase/version alignment

Does **not** overwrite production data. Result stored in `vsp:production:restore:validation`.

---

## Backup readiness

`GET /api/v1/production/backup/readiness` validates:

- `BACKUP_LOCATION` configured
- `BACKUP_SCHEDULE` documented (optional in dev)
- Restore verify hook enabled (Phase 17 `BackupDrService`)

No external backup product integration (per scope).

---

## Environment profiles

| Profile | `VSP_ENV` values | Strictness |
|---------|------------------|------------|
| development | `development`, `dev` | Low |
| testing | `testing`, `test` | Low |
| staging | `staging`, `stage` | Medium |
| production | `production`, `prod` | High (fail-fast) |

`GET /api/v1/production/environment` returns active profile and policy.

Runtime behavior unchanged in development — profiles affect validation only.

---

## CI/CD readiness

`GET /api/v1/production/cicd/readiness` reports (no pipeline YAML generated):

- Immutable configuration posture
- Environment separation
- Startup validation status
- Health endpoints available
- Graceful shutdown wired (Phase 17)
- Deployment readiness aggregate

---

## Operational documentation

### Prerequisites

- PostgreSQL 15+ reachable (`DATABASE_URL`)
- Redis reachable (`REDIS_URL` or Sentinel/Cluster config)
- Kamailio HTTP listener (`KAMAILIO_HTTP_HOST:PORT`)
- RTPengine NG port (`RTPENGINE_HOST:NG_PORT`)
- TLS certificates when `VSP_ENV=production`
- Secrets: `JWT_SECRET`, `TELECOM_SERVICE_AUTH_TOKEN`, `TELNYX_WEBHOOK_SECRET`

### Startup order

1. PostgreSQL
2. Redis
3. Kamailio
4. RTPengine
5. NestJS API (`nx serve api` or container)
6. Provisioning edge (optional, `PROV_HTTPS_ENABLED`)

### Dependency validation

- Automatic: `ProductionConfigValidatorService` on API boot
- Manual: `GET /api/ready`, `GET /api/v1/production/readiness`

### Health verification

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
curl -H "X-Telecom-Service-Auth: $TOKEN" http://localhost:3000/api/v1/production/readiness
curl -H "X-Telecom-Service-Auth: $TOKEN" http://localhost:3000/api/v1/production/version
```

### Rollback prerequisites

- Prior release artifact available
- Config snapshot exported (`GET /api/v1/production/config/export`)
- Restore validation passed (`POST /api/v1/production/restore/validate`)
- Database backup from `BACKUP_LOCATION`

### Post-deployment verification

1. `/api/v1/production/readiness` → `ready: true`
2. `/api/v1/telecom/health` → `status: ok`
3. `/api/v1/ha/readiness` → HA report green
4. Place test call (lab) — unchanged telecom behavior

---

## Readiness APIs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/production/readiness` | Service | Deployment readiness |
| GET | `/api/v1/production/version` | Service | Release information |
| GET | `/api/v1/production/environment` | Service | Active profile |
| GET | `/api/v1/production/config/export` | Service | Non-sensitive config export |
| POST | `/api/v1/production/restore/validate` | Service | Restore validation |
| GET | `/api/v1/production/backup/readiness` | Service | Backup readiness |
| GET | `/api/v1/production/cicd/readiness` | Service | CI/CD readiness report |

Existing telecom, auth, HA, observability contracts unchanged.

---

## Environment variables

See `.env.example` section **Production Platform (Phase 18)**:

- `RELEASE_NUMBER`, `BUILD_GIT_COMMIT`, `BUILD_TIMESTAMP`
- `BACKUP_SCHEDULE` (documentation/validation; no scheduler implemented)

All optional in development; production profile enforces via startup validator.

---

## Validation results

```bash
npm run telecom:validate:phase18
```

| Check | Result |
|-------|--------|
| Production platform module | PASS |
| `/production/readiness` + `/production/version` | PASS |
| Startup validation + secrets exclusion | PASS |
| Prisma schema frozen | PASS |
| Kamailio unchanged | PASS |
| RTPengine unchanged | PASS |
| `nx build api` | PASS |
| `nx lint api` | PASS |
| Phase 17 regression | PASS |

Telecom health mode: `phase18-production-platform`.

---

## Regression results

- Phase 17 HA/scalability — PASS (nested regression)
- Phase 16 security — PASS (via phase 17 chain)
- TypeScript build — PASS
- Lint — PASS

---

## Production checklist

- [ ] Set `VSP_ENV=production`
- [ ] Configure all required secrets (JWT, telecom auth, Telnyx webhook)
- [ ] Enable TLS (`TLS_ENABLED=true`)
- [ ] Set `BACKUP_LOCATION` and `BACKUP_SCHEDULE`
- [ ] Set `RELEASE_NUMBER`, `BUILD_GIT_COMMIT`, `BUILD_TIMESTAMP` in CI
- [ ] Configure `KAMAILIO_NODES`, `RTPENGINE_NODES` for topology
- [ ] Run `GET /api/v1/production/readiness` — must return `ready: true`
- [ ] Export config snapshot before deploy
- [ ] Verify `/api/ready` after deploy
- [ ] Confirm graceful shutdown (`SHUTDOWN_DRAIN_MS`) in orchestrator

---

## Explicitly out of scope (per phase gate)

- Tenant migration
- DID migration
- Grandstream migration
- Mobile migration
- Production cutover / go-live
- Legacy platform shutdown
- External backup software integration
- CI/CD pipeline YAML for specific platforms

**Phase 18 complete. Do not proceed to migration/cutover without explicit approval.**
