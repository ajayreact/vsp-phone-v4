# RC1 Build Report — VSP Phone v4

| Field | Value |
|-------|-------|
| **Document ID** | RC1-BUILD-001 |
| **Version** | v4.0.0-rc1 |
| **Date** | 2026-07-08 |
| **Environment** | Windows 10, Node.js (npm ci clean install) |

---

## 1. Code Freeze Verification

Report-only scan of production source (`apps/api/src`, `apps/admin/src`, `packages/*`, `infrastructure/*`). Build artifacts (`.next/`, `node_modules/`) excluded.

### 1.1 Debug code

| Check | Result | Notes |
|-------|--------|-------|
| `console.log` in API source | **PASS** | No raw `console.log` in `apps/api/src`. Structured logging via NestJS `Logger` and JSON console wrapper in `main.ts`. |
| Debug log level usage | **PASS** | `logger.debug()` used for operational tracing only (rate limits, vault, traces). Expected in production with `LOG_LEVEL=info`. |

### 1.2 TODO / FIXME comments

| Check | Result | Notes |
|-------|--------|-------|
| `TODO` / `FIXME` / `HACK` in API source | **PASS** | Zero matches in `apps/api/src/**/*.ts`. |
| `TODO` / `FIXME` in Admin source | **PASS** | Zero matches in `apps/admin/src/**/*.ts`. |

### 1.3 Placeholder implementations

| Item | Severity | Location | Notes |
|------|----------|----------|-------|
| `placeholder: true` on `device()` telecom endpoint | **Low** | `telecom.service.ts` | API contract field; device lifecycle handler returns accepted stub. Documented capability gap, not a debug stub. |
| `placeholder: true` when Prisma unavailable | **Info** | `browser-presence.service.ts` | Graceful degradation when DB disconnected. |
| `placeholder` DTO field across routing/call apps | **Info** | Telecom DTOs | Contract metadata (`placeholder: false` on implemented paths). Intentional API shape. |
| `uploadPlaceholder()` recording helper | **Info** | `recording-upload.service.ts` | S3 upload path naming; not a mock service. |

**Verdict:** No inappropriate placeholder implementations in production paths. One partial telecom endpoint (`device`) remains contract-level stub.

### 1.4 Mock services

| Check | Result | Notes |
|-------|--------|-------|
| Dedicated mock modules | **PASS** | No mock service modules enabled in production wiring. |
| Dev-open auth stubs | **Conditional** | When `TELECOM_SERVICE_AUTH_TOKEN` / `TELNYX_WEBHOOK_SECRET` unset, guards log and allow requests (lab mode). **Must be disabled in production** via env (enforced by `assertProductionSecurity`). |

### 1.5 Development secrets

| Item | Risk in production | Mitigation |
|------|-------------------|------------|
| `.env.example` contains `DEV_JWT_SECRET`, `DEV_AUTH_*`, `SIP_DEV_PASSWORD` | **High if copied to prod** | Production startup rejects missing `JWT_SECRET` / tokens. Config export excludes dev keys (`production-config.constants.ts`). |
| `MIGRATION_DEV_SUPER_ADMIN=true` default | **Medium** | Super Admin bypass in dev only when `VSP_ENV=development`. Set `false` in production. |
| Default MinIO/S3 dev credentials in `.env.example` | **High if copied** | Documented as lab-only. |

**Verdict:** Dev secrets present in templates only. Production validation blocks unset production secrets.

### 1.6 Unused environment variables

| Check | Result |
|-------|--------|
| `.env.example` vs `env.validation.ts` | **Mostly aligned.** Remediation vars (`KAMAILIO_*`, `BACKUP_POSTGRES_HOOK_CMD`) documented. |
| Undocumented vars in compose | Minor drift possible on compose-only overrides; no orphan critical vars identified. |

### 1.7 Dead feature flags

| Check | Result | Notes |
|-------|--------|-------|
| Dedicated feature-flag framework | **N/A** | No LaunchDarkly-style flag system. |
| Operational flags | **Review** | `READINESS_STRICT`, `MIGRATION_DEV_SUPER_ADMIN`, `HA_CONFIG_SNAPSHOT_ON_START` — all active code paths. |
| `OBSERVABILITY_REDIS_KEYS` | **Info** | Defined; keys referenced inline in services. Not a dead flag. |

### Code freeze summary

| Category | Status |
|----------|--------|
| Debug / TODO cleanup | **PASS** |
| Production secret hygiene | **PASS** (with operator discipline) |
| Partial implementations | **1 low finding** (`device` endpoint) |
| Mock/dev stubs | **PASS** when production env enforced |

---

## 2. Build Verification

### 2.1 Clean install

```bash
npm ci
```

| Result | Exit code | Duration |
|--------|-----------|----------|
| **PASS** | 0 | ~638s |

Post-install: `npm audit` reports 13 vulnerabilities (see `DEPENDENCY_AUDIT.md`).

### 2.2 Production build — primary deliverables

| Target | Command | Result |
|--------|---------|--------|
| API | `npx nx build api` | **PASS** |
| Admin | `npx nx build admin` | **PASS** |

Both use webpack/Next production pipelines. API emits compiled bundle; Admin emits static + SSR output.

### 2.3 Full monorepo build

```bash
npm run build
# nx run-many -t build --projects=common,config,logger,api,admin
```

| Project | Result | Error |
|---------|--------|-------|
| api | **PASS** | — |
| admin | **PASS** | — |
| common | Not reached independently | — |
| **config** | **FAIL** | TS4111: `env.VSP_ENV` / `env.NODE_ENV` index signature access |
| **logger** | **FAIL** | TS4111: `process.env.LOG_FORMAT` index signature access |

**Verdict:** Primary RC1 deployables (API, Admin) build successfully. Shared library packages `config` and `logger` fail strict TypeScript compilation. **Full monorepo build: FAIL.**

### 2.4 Lint

| Target | Command | Result |
|--------|---------|--------|
| API | `npx nx lint api` | **PASS** (0 errors) |
| Admin | `npx nx lint admin` | **PASS** (0 errors, **2 warnings**) |

Admin warnings are non-blocking ESLint warnings (details in lint output).

### 2.5 Type checking

| Scope | Result |
|-------|--------|
| API (webpack build) | **PASS** (bundled via webpack) |
| Admin (Next build) | **PASS** |
| packages/config, packages/logger | **FAIL** (TS4111) |

No dedicated `typecheck` nx target executed separately; library tsc build surfaces errors.

### 2.6 Telecom validation

| Script | Result |
|--------|--------|
| `npm run telecom:validate:remediation` | **PASS** |
| `npm run telecom:validate:phase20` | **PASS** |

Remediation validator includes: frozen schema/migrations, Kamailio/RTPengine checks, RBAC, backup orchestration, build, lint, phase20 regression chain.

### 2.7 Consolidated build matrix

| Gate | Status |
|------|--------|
| Clean install (`npm ci`) | ✅ PASS |
| API production build | ✅ PASS |
| Admin production build | ✅ PASS |
| Full monorepo build | ❌ FAIL |
| Lint (api + admin) | ✅ PASS |
| Typecheck (libraries) | ❌ FAIL |
| Telecom remediation validation | ✅ PASS |
| Telecom phase20 validation | ✅ PASS |

---

## Related documents

- [DEPENDENCY_AUDIT.md](./DEPENDENCY_AUDIT.md)
- [QUALITY_GATE.md](./QUALITY_GATE.md)
- [DEPLOYMENT_PACKAGE_REPORT.md](./DEPLOYMENT_PACKAGE_REPORT.md)
