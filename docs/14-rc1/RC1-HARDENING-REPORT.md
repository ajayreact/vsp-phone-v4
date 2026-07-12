# RC1 Hardening Report

| Field | Value |
|-------|-------|
| **Version** | v4.0.0-rc1 |
| **Date** | 2026-07-13 |
| **Release commit** | Branch tip of `release/v4.0.0-rc1` (supersedes `ee3f990`) |
| **Branch** | `release/v4.0.0-rc1` |
| **Recommendation** | **NOT READY FOR RC1** (candidate reproducible; staging deploy pending) |

---

## Executive summary

Builds pass (`admin:build`, `api:build`). Staging API health is green. Code-level audits for security, provisioning, and database integrity are complete. **Live end-to-end workflow verification, browser QA, and database integrity execution against staging were not completed** due to missing platform credentials and no manual browser pass in this session.

**Three release blockers** prevent RC1 approval today:

1. Unauthenticated admin BFF observability proxy (RC1-001)
2. No authenticated E2E verification on staging (RC1-002)
3. Browser compatibility QA not executed (RC1-003)

---

## 1. Runtime verification report

### Automated

| Check | Result |
|-------|--------|
| `GET https://api.vspphone.com/api/health` | **200** — `status: ok`, `mode: remediation-complete` |
| `probe-production-readonly.cjs` | Health OK; login **400** (no credentials in `.env`) |
| `verify-extension-first-runtime.cjs` | **Blocked** — `PLATFORM_EMAIL` / `PLATFORM_PASSWORD` not set |

### Platform Admin workflows

| Workflow | Code | Live staging |
|----------|------|--------------|
| Login | JWT + refresh implemented | **Not verified** |
| Dashboard | Operational sections + quick actions | **Not verified** |
| Tenants | List + detail 8 tabs | **Not verified** |
| DID Inventory | Read-only + provision entry | **Not verified** |
| Provisioning Wizard | Full orchestrator + retry | **Not verified** |
| Tenant Detail | Cache invalidation on provision | **Not verified** |

### Tenant Portal workflows

| Workflow | Code | Live staging |
|----------|------|--------------|
| Login | Tenant-scoped JWT | **Not verified** |
| Extension Hub | `/v1/tenant/extensions/hub` | **Not verified** |
| Configure Extension | Tenant portal modules | **Not verified** |
| Phone Setup / QR | ExtensionPhoneSetupCenter, ExtensionQrPanel | **Not verified** |
| Desk Phone Provisioning | Prov edge + MAC auth | **Not verified** |
| Voicemail / Call Handling | Tenant routes exist | **Not verified** |

### Production verification (404/500/console)

| Check | Status |
|-------|--------|
| No 404s on primary routes | **Not tested** (browser pass required) |
| No 500s on API calls | **Not tested** |
| No console errors | **Not tested** |
| No hydration warnings | **Not tested** |
| No failed network requests | **Not tested** |

---

## 2. Security audit summary

### Strengths

- JWT `tenantId` bound at login from DB user record
- Tenant portal APIs scope all queries to `user.tenantId` — no tenant override params
- RBAC via `PermissionsGuard` + Prisma permission checks
- Auth hardening: lockout, session revocation, rate limits
- Portal hostname isolation (`admin.*` / `app.*` / `tenant.*`)
- Production config validator for critical secrets

### Critical / high findings

| ID | Severity | Finding |
|----|----------|---------|
| RC1-001 | **Critical** | `/api/bff/observability/*` is in middleware `PUBLIC_PREFIXES`; no user JWT required; accepts `?tenantId=` and proxies with service token |
| RC1-004 | High | `DEV_AUTH_*` bypass if set in production |
| RC1-005 | High | `TELECOM_SERVICE_AUTH_TOKEN` unset → service auth stub allows all |
| RC1-006 | Medium | Refresh token in `localStorage` |
| RC1-007 | Medium | Swagger enabled by default |
| RC1-008 | Medium | UI route RBAC incomplete; API is authoritative |

### Tenant isolation verdict

**API tenant portal: Ready** (with Prisma connected, no dev bypasses).

### Platform isolation verdict

**Hostname routing: Ready** for production vhosts.

**Admin BFF layer: Not ready** — must restrict before public RC1.

---

## 3. Performance summary

| Metric | Measurement | Notes |
|--------|-------------|-------|
| Dashboard load | **Not measured** | Requires browser + staging auth |
| Extensions Hub load | **Not measured** | |
| Provisioning time | **Not measured** | Sequential bulk assign ~1–3s/number (estimate) |
| Tenant Detail load | **Not measured** | |
| Phone Setup load | **Not measured** | |
| Large tenant (100+ ext) | **Not measured** | |
| Large DID inventory | **Not measured** | |

### Optimizations already in place (Phase 3B.1)

- Post-provision validation uses `queryClient.fetchQuery` (cache-aware)
- Expanded cache invalidation after provision (tenant detail, org, audit)
- No additional duplicate-fetch removal applied (no measurable baseline)

---

## 4. Browser compatibility report

| Browser | Status |
|---------|--------|
| Chrome | **Not tested** |
| Edge | **Not tested** |
| Firefox | **Not tested** |
| Responsive | **Not tested** |
| Dark mode | **Not tested** |
| Accessibility / keyboard | **Not tested** |

---

## 5. Database integrity report

### Script

`scripts/platform/db-integrity-verification.sql` — checks:

- Orphan DIDs, extensions, lines, inbound routes
- Duplicate extensions per tenant
- Duplicate DID bindings
- DID → line → extension → route chain consistency

### Live execution

**Not run** — requires staging/production database access.

Run before RC1 approval:

```bash
psql "$DATABASE_URL" -f scripts/platform/db-integrity-verification.sql
```

---

## 6. Deployment checklist

See [RELEASE-CHECKLIST.md](./RELEASE-CHECKLIST.md).

Build status:

| Target | Result |
|--------|--------|
| `nx run admin:build` | **PASS** |
| `nx run api:build` | **PASS** |
| `nx run admin:lint` | **FAIL** (3 ESLint plugin config errors, 56 warnings) |

---

## 7. Known issues

See [KNOWN-ISSUES.md](./KNOWN-ISSUES.md).

---

## 8. Release blockers

| Priority | Blocker | Unblock action |
|----------|---------|----------------|
| P0 | RC1-001 BFF unauthenticated proxy | Add JWT + permission check on `/api/bff/*` OR network-restrict admin host |
| P0 | RC1-002 No live E2E verification | Configure credentials; run verification scripts + manual wizard pass |
| P0 | RC1-003 Browser QA incomplete | Execute browser checklist on staging |
| P1 | Database integrity not executed | Run SQL script on staging DB |
| P1 | RC1-004/005 production env audit | Verify no dev bypass vars; service token set |
| P2 | RC1-012 lint config | Fix ESLint plugins (non-blocking for runtime) |

---

## 9. Recommendation

## NOT READY FOR RC1

The codebase is **build-ready** and **architecturally sound** for multi-tenant isolation at the API layer. RC1 approval requires:

1. Fix or mitigate RC1-001 (BFF auth)
2. Complete staging E2E verification with platform + tenant credentials
3. Execute browser QA checklist
4. Run database integrity SQL on staging with zero critical findings
5. Sign off [RELEASE-CHECKLIST.md](./RELEASE-CHECKLIST.md)

Estimated effort to reach **READY FOR RC1**: 1–2 days with staging access and one QA engineer.

---

## Documentation delivered

All RC1 operational docs: `docs/14-rc1/`
