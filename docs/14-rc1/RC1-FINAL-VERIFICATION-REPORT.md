# RC1 Final Verification Report

| Field | Value |
|-------|-------|
| **Version** | v4.0.0-rc1 |
| **Date** | 2026-07-13 |
| **Release commit** | Branch tip of `release/v4.0.0-rc1` (supersedes `ee3f990`) |
| **Branch** | `release/v4.0.0-rc1` |
| **Script** | `node scripts/platform/verify-rc1-final.cjs` |
| **Artifact** | `static/runtime-verification/rc1-final-report.json` |

---

## Final recommendation: **NOT READY FOR RC1**

Code and local verification are strong. **Three blockers** prevent RC1 approval:

1. **Staging admin not redeployed** — `https://admin.vspphone.com/api/bff/*` returns **502** (legacy build). Secured BFF verified on **localhost:3001** only.
2. **Platform E2E incomplete** — `PLATFORM_EMAIL` / `PLATFORM_PASSWORD` not in environment; provisioning batches (1/5/25 DIDs) not executed.
3. **Database integrity** — cannot connect to staging PostgreSQL from this workstation (`password authentication failed for user "vsp"`).

---

## 1. Security Verification Report

### Local admin (built with RC1-001 fix) — **PASS**

| Endpoint | Anonymous | Tenant JWT | Expected |
|----------|-----------|------------|----------|
| `/api/bff/observability/health` | **401** | **403** | ✓ |
| `/api/bff/observability/dashboard` | **401** | **403** | ✓ |
| `/api/bff/observability/calls` | **401** | **403** | ✓ |
| `/api/bff/readiness` | **401** | **403** | ✓ |

- JWT required via `Authorization: Bearer`
- Permissions enforced via `/v1/auth/me`
- `tenantId` query parameter **not trusted** (calls route uses JWT tenant only)
- Service token **not exposed** to browser (server-side only)
- Unit tests: `node scripts/platform/test-bff-auth-unit.cjs` → **8/8 PASS**

### Staging admin — **FAIL (not deployed)**

```
GET https://admin.vspphone.com/api/bff/observability/health → 502 {"error":"fetch failed"}
```

**Action:** Deploy admin container with RC1-001 fix, then run `ADMIN_BASE=https://admin.vspphone.com node scripts/platform/verify-bff-security.cjs`.

### Platform admin → 200

**Not verified** — platform credentials unavailable in `.env`.

---

## 2. Environment Audit Report

| Check | Local `.env` | Staging API | Pass |
|-------|--------------|-------------|------|
| `DEV_AUTH_*` absent | ✓ (none set) | — | ✓ |
| `SWAGGER_ENABLED=false` | ✓ | — | ✓ |
| `JWT_SECRET` configured | ✓ (64 chars) | — | ✓ |
| `TELECOM_SERVICE_AUTH_TOKEN` | ✓ (64 chars) | — | ✓ |
| `DATABASE_URL` set | ✓ | Local PG auth fails | Partial |
| HTTPS API URL | ✓ `https://api.vspphone.com/api` | ✓ | ✓ |
| `GET /health` | — | **200 ok** | ✓ |
| `GET /ready` | — | **200** | ✓ |
| Redis | — | **up** (health checks) | ✓ |
| Postgres | — | **up** (health checks) | ✓ |
| Kamailio / RTPengine | — | **up** | ✓ |

**Not verified from this session:** production host cookie flags, CORS headers, rate limit enforcement on live traffic, production `.env` on EC2 (requires SSH/deploy audit).

---

## 3. Browser QA Report

### Chromium (Playwright) — tenant.vspphone.com — **PASS 6/6**

| Test | Result |
|------|--------|
| Login page — no console errors | ✓ |
| `/extensions` auth redirect | ✓ |
| Login → Extension Hub KPI cards | ✓ |
| Rename extension | ✓ |
| QR Login panel | ✓ |
| Desk phone manufacturer fields | ✓ |

Artifacts: `static/runtime-verification/playwright/`

### Edge / Firefox / Responsive breakpoints

**Not executed** — requires manual or additional Playwright projects.

### Known browser note

One **403 console resource** on Extension Hub load (hub API calls return 200). Non-blocking; logged for follow-up.

---

## 4. Provisioning Verification Report

| Batch | Status |
|-------|--------|
| 1 DID | **Not run** — requires platform credentials |
| 5 DIDs | **Not run** |
| 25 DIDs | **Not run** |

**Blocked by:** missing `PLATFORM_EMAIL` / `PLATFORM_PASSWORD`.

---

## 5. Tenant Portal Verification Report

### API (staging, signoff tenant) — **PASS 10/10**

| Workflow | Status | Latency |
|----------|--------|---------|
| Login | 201 | 313ms |
| Dashboard | 200 | 306ms |
| Extension Hub | 200 | 293ms |
| Extension Hub Stats | 200 | 287ms |
| DIDs | 200 | 271ms |
| Voicemail | 200 | 275ms |
| Inbound Routes | 200 | 269ms |
| CDR | 200 | 266ms |
| Recordings | 200 | 266ms |

### UI (Chromium)

| Workflow | Status |
|----------|--------|
| Extension Hub + KPI | ✓ |
| Configure / Rename | ✓ |
| Phone Setup / QR | ✓ |
| Desk Phone fields | ✓ |
| Settings / Reports / Call Handling (full manual) | Partial — API verified, UI not fully walked |

---

## 6. Database Integrity Report

| Check | Result |
|-------|--------|
| Script ready | `scripts/platform/db-integrity-verification.sql` |
| Live execution | **BLOCKED** — local `DATABASE_URL` cannot authenticate to PostgreSQL |

**Pass criteria:** All summary counts = 0 on staging DB before RC1.

---

## 7. Regression Report

| Area | Result |
|------|--------|
| `nx run admin:build` | **PASS** |
| `nx run api:build` | **PASS** |
| Tenant Extension Hub (API + UI) | **PASS** |
| BFF security (local) | **PASS** |
| Provisioning Wizard code | Unchanged — no regression in build |
| Platform Portal E2E | **Not run** |

---

## 8. Performance Report

From `verify-rc1-final.cjs` (staging API + local BFF):

| Metric | Value |
|--------|-------|
| Average API latency | **249ms** |
| Slowest call | BFF auth check (first `/me` round-trip) **799ms** |
| Tenant dashboard | **306ms** |
| Extension Hub | **293ms** |
| Extension Hub stats | **287ms** |
| Tenant Detail (platform) | Not measured |

**Duplicate API calls:** Post-provision cache uses `fetchQuery` (3B.1) — no new duplicates identified.

**Recommendation:** None required for RC1; optional BFF auth cache if `/me` latency becomes visible in UI.

---

## 9. Updated Release Checklist

See [`RELEASE-CHECKLIST.md`](./RELEASE-CHECKLIST.md).

| Section | Status |
|---------|--------|
| BFF security (code) | ✓ Done |
| BFF security (staging deploy) | ✗ Pending |
| Environment audit (API) | ✓ Done |
| Environment audit (production host) | ✗ Pending |
| Tenant E2E (API + Chromium) | ✓ Done |
| Platform E2E | ✗ Blocked |
| Provisioning batches | ✗ Blocked |
| DB integrity | ✗ Blocked |
| Edge/Firefox/responsive | ✗ Pending |

---

## 10. Remaining Risks

| Risk | Severity |
|------|----------|
| Staging admin BFF not redeployed | **Critical** |
| Platform provisioning not verified live | **High** |
| DB integrity not executed on staging | **High** |
| Platform credentials not in CI/local env | **High** |
| Edge/Firefox/responsive QA incomplete | **Medium** |
| Console 403 on Extension Hub (non-hub API) | **Low** |
| `MIGRATION_DEV_SUPER_ADMIN=true` in local `.env` | **Low** (dev only) |

---

## 11. Unblock checklist (to reach READY FOR RC1)

1. Deploy admin image with BFF security fix to `admin.vspphone.com`
2. Verify: `ADMIN_BASE=https://admin.vspphone.com node scripts/platform/verify-bff-security.cjs`
3. Add `PLATFORM_EMAIL` / `PLATFORM_PASSWORD` to `.env` (or CI secrets)
4. Run `node scripts/platform/verify-rc1-final.cjs` → 27/27 pass including platform BFF 200
5. Execute provisioning 1 / 5 / 25 DIDs on staging test tenant
6. Run `psql $STAGING_DATABASE_URL -f scripts/platform/db-integrity-verification.sql` → all zeros
7. Complete Edge/Firefox + responsive manual pass
8. Audit production EC2 `.env` for `DEV_AUTH_*` absence and Swagger disabled

---

## Commands reference

```bash
# Full RC1 verification
node scripts/platform/verify-rc1-final.cjs

# BFF security (after deploy)
ADMIN_BASE=https://admin.vspphone.com node scripts/platform/verify-bff-security.cjs

# Tenant UI (Chromium)
cd apps/admin-e2e
BASE_URL=https://tenant.vspphone.com npx playwright test src/extension-first-smoke.spec.ts src/extension-first-runtime.spec.ts -c playwright.local.config.mts

# DB integrity (on staging host)
node scripts/platform/run-db-integrity.cjs
```
