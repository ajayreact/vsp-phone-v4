# Tenant Portal V2 Production Readiness Report

> **Repository note (release/v4.0.0-rc1):** This report and `scripts/tenant-portal-v2-audit.mjs` were generated during the V2 audit but **were never committed**. HEAD on `release/v4.0.0-rc1` is `c5290b6`; there is **no commit** that introduces the audit script. Do not run `node scripts/tenant-portal-v2-audit.mjs` on a deployed rc1 checkout — the file is not present.

Generated: 2026-07-11T12:37:49.427Z

## Production verification on release/v4.0.0-rc1

Use the scripts and endpoints that **are** on this branch:

### 1. Health and readiness (already verified)

```bash
curl -sS https://<your-api-host>/api/health
curl -sS https://<your-api-host>/api/ready
```

Both should return OK/`status: ok` with Postgres, Redis, Kamailio, and RTPEngine up.

### 2. Cutover readiness

```bash
curl -sS -H "Authorization: Bearer $TOKEN" https://<your-api-host>/api/v1/cutover/readiness
```

Expect `ready: true` when infrastructure checks pass.

### 3. Full production E2E (platform + tenant onboarding)

```bash
API_BASE=https://<your-api-host>/api \
PLATFORM_EMAIL=<super-admin-email> \
PLATFORM_PASSWORD=<super-admin-password> \
node scripts/platform/verify-production-e2e.cjs
```

This script is committed on rc1 and exercises platform menus, tenant onboard, tenant login, and audit persistence.

### 4. Onboarding runtime checks

```bash
node scripts/platform/verify-onboarding-runtime.cjs --api-base https://<your-api-host>/api --token $JWT
```

### 5. Build verification (CI or pre-deploy)

```bash
npx nx run api:build
npx nx run admin:build
```

See also `docs/11-final-audit/FINAL_DEPLOYMENT_CHECKLIST.md` on this branch for the full deployment checklist.

---

## Static audit results (local dev only — not on rc1)

The table below reflects a **local** static audit run before commit; it is **not** reproduced by any script on `release/v4.0.0-rc1`.

| Module | Route | Status | Notes |
|--------|-------|--------|-------|
| dashboard | /dashboard | PASS | OK |
| organization-company | /organization/company | PASS | OK |
| organization-sites | /organization/sites | PASS | OK |
| organization-departments | /organization/departments | PASS | OK |
| users | /people/users | PASS | OK |
| extensions | /people/extensions | PASS | OK |
| devices | /people/devices | PASS | OK |
| provision-employee | /people/provision | PASS | OK |
| my-numbers | /phone-numbers/my-numbers | PASS | OK |
| number-requests | /phone-numbers/requests | PASS | OK |
| did-routing | /phone-numbers/routing | PASS | OK |
| ivr | /call-flow/ivr | PASS | OK |
| ring-groups | /call-flow/ring-groups | PASS | OK |
| queues | /call-flow/queues | PASS | OK |
| time-conditions | /call-flow/time-conditions | PASS | OK |
| holidays | /call-flow/holidays | PASS | OK |
| incoming-routes | /call-flow/incoming-routes | PASS | OK |
| outgoing-routes | /call-flow/outgoing-routes | PASS | OK |
| voicemail | /communication/voicemail | PASS | OK |
| conferences | /communication/conferences | PASS | OK |
| paging | /communication/paging | PASS | OK |
| announcements | /communication/announcements | PASS | OK |
| music-on-hold | /communication/music-on-hold | PASS | OK |
| cdr | /reports/cdr | PASS | OK |
| call-recordings | /reports/recordings | PASS | OK |
| analytics | /reports/analytics | PASS | OK |
| settings-pbx | /settings/pbx | PASS | OK |
| settings-security | /settings/security | PASS | OK |
| settings-api-keys | /settings/api-keys | PASS | OK |
| supervisor | /contact-center/supervisor | PASS | OK |
| reception | /contact-center/reception | PASS | OK |
| schema:destinationExtensionId | prisma/schema.prisma | PASS | OK |
| schema:destinationVoicemailId | prisma/schema.prisma | PASS | OK |
| schema:destinationConferenceId | prisma/schema.prisma | PASS | OK |
| provision-transaction | tenant-provision.service | PASS | Single DB transaction |
| inbound-route-dest-fks | tenant-dids.service | PASS | Dedicated FKs used |

**Summary:** 36 PASS / 0 FAIL
