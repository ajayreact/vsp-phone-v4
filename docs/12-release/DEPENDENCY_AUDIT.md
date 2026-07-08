# RC1 Dependency Audit — VSP Phone v4

| Field | Value |
|-------|-------|
| **Document ID** | RC1-DEPS-001 |
| **Version** | v4.0.0-rc1 |
| **Date** | 2026-07-08 |
| **Scope** | Root `package.json` / `package-lock.json` |
| **Action taken** | Audit and recommendations only — **no upgrades applied** |

---

## Executive summary

Dependencies are modern and appropriate for an Nx 23 + NestJS 11 + Next 16 monorepo. **13 npm audit findings** (12 moderate, 1 high) are concentrated in **development tooling** (Nx, webpack-dev-server, Prisma dev transitive deps), not in runtime API dependencies. Primary runtime stack (NestJS, Prisma client, pg, ioredis, axios) shows no direct high-severity runtime advisories in the audit summary.

---

## Direct runtime dependencies (production)

| Package | Version | Role | Assessment |
|---------|---------|------|------------|
| `@nestjs/*` | ^11.0.0 | API framework | Current major; LTS-aligned |
| `@prisma/client` | ^7.8.0 | ORM | Current; matches `prisma` CLI |
| `pg` | ^8.22.0 | PostgreSQL driver | Stable |
| `ioredis` | ^5.11.1 | Redis client | Stable |
| `axios` | ^1.6.0 → resolved **1.16.0** | HTTP client | Minor behind latest 1.18.x |
| `class-validator` / `class-transformer` | Current | DTO validation | Standard NestJS stack |
| `@aws-sdk/client-s3` | ^3.1081.0 | Object storage | Current v3 SDK |
| `next` / `react` | ~16.1.6 / ^19.0.0 | Admin UI | Current generation |
| `sip.js` | ^0.21.2 | WebRTC client | Appropriate for browser SIP |

**Recommendation:** No mandatory runtime upgrades for RC1 staging. Consider `axios` patch upgrade in a post-RC1 maintenance window.

---

## Development dependencies

| Package | Version | Notes |
|---------|---------|-------|
| `nx` | 23.0.1 | Monorepo orchestration; audit findings via `@nx/webpack`, `@nx/next` chain |
| `typescript` | ~5.9.2 | Current 5.x; latest listed 7.x (major jump — defer) |
| `webpack` / `webpack-dev-server` | 5.108.x / 5.2.6 | Dev-server moderate advisory (see security section) |
| `jest` | ~30.3.0 | Test runner |
| `@playwright/test` | ^1.37.0 | E2E (if used) |

---

## Security advisories (`npm audit`)

**Summary:** 13 vulnerabilities (**12 moderate**, **1 high**)

| Advisory area | Severity | Affected chain | Runtime impact |
|---------------|----------|----------------|------------------|
| `@hono/node-server` middleware bypass | Moderate | Transitive via `@prisma/dev` / Prisma tooling | **Dev-only** (Prisma CLI/dev) |
| `webpack-dev-server` | Moderate/High | `@nx/webpack` → `@nx/next` | **Dev-only** (local serve) |
| `@nx/*` module federation / web / react | Moderate | Nx toolchain | **Dev/build-only** |

**Recommendation (do not auto-upgrade):**

1. **RC1 staging:** Accept dev-toolchain advisories with network isolation on build agents; production containers use `production` Docker targets without webpack-dev-server.
2. **Post-RC1:** Track Nx 23.x patch releases for webpack-dev-server transitive fix.
3. **Do not** run `npm audit fix --force` before RC1 — would downgrade Prisma major and Nx major (breaking).
4. Re-run `npm audit` after any Nx patch upgrade in a controlled branch.

---

## Duplicate / nested packages

| Package | Observation | Risk |
|---------|-------------|------|
| `webpack` | 5.105.2 (module-federation) vs 5.108.4 (main tree) | Low — npm dedupe resolves at build time |
| `axios` | Single deduped 1.16.0 | Low |
| `@swc/core` | Single version in tree | Low |

**Recommendation:** Run `npm dedupe` in a post-RC1 hygiene PR (non-blocking for staging).

---

## Deprecated packages

No explicitly deprecated direct dependencies identified. Transitive deprecation warnings were not exhaustively enumerated.

---

## Unnecessary dependencies

| Package | Assessment |
|---------|------------|
| `@playwright/test` | Retained if E2E planned; otherwise candidate for optional devDependency group |
| Full Nx plugin set (`@nx/next`, `@nx/nest`, `@nx/webpack`, etc.) | Required for current monorepo layout |

**Recommendation:** No removals for RC1 — risk of breaking build graph.

---

## Outdated packages (`npm outdated` sample)

| Package | Current | Latest | Recommendation |
|---------|---------|--------|----------------|
| axios | 1.16.0 | 1.18.1 | Patch/minor upgrade post-RC1 |
| next | 16.1.7 | 16.2.10 | Minor upgrade post-RC1 with regression |
| rxjs | 7.8.1 | 7.8.2 | Optional patch |
| eslint | 9.39.4 | 10.6.0 | **Defer** — major |
| typescript | 5.9.3 | 7.0.2 | **Defer** — major |
| dotenv | 16.4.7 | 17.4.2 | **Defer** — major |

---

## RC1 dependency verdict

| Criterion | Status |
|-----------|--------|
| Runtime deps appropriate | ✅ |
| No auto-upgrades performed | ✅ |
| Security advisories documented | ✅ |
| Blocking runtime CVEs | **None identified in direct runtime deps** |
| Dev-toolchain CVEs | **13 findings — monitor, do not block staging if build agents isolated** |

---

## Related documents

- [BUILD_REPORT.md](./BUILD_REPORT.md)
- [QUALITY_GATE.md](./QUALITY_GATE.md)
