# RC1 Blocker Resolution — Staging Verification Report

| Field | Value |
|-------|-------|
| **Blocker** | RC1-002 |
| **Status** | **Partial — credentials required** |
| **Date** | 2026-07-13 |

## Script

`node scripts/platform/verify-rc1-blockers.cjs`

Output artifact: `static/runtime-verification/rc1-blocker-report.json`

## Results (this session)

| Area | Step | Result |
|------|------|--------|
| env | API health | **PASS** — `https://api.vspphone.com/api/health` 200 ok |
| env | platform credentials | **FAIL** — `PLATFORM_EMAIL` / `PLATFORM_PASSWORD` not in `.env` |
| platform | All workflows | **Skipped** |
| tenant | All workflows | **Skipped** |

## Required to complete RC1-002

Add to `.env`:

```env
PLATFORM_EMAIL=<platform super admin>
PLATFORM_PASSWORD=<password>
TENANT_EMAIL=<tenant admin>
TENANT_PASSWORD=<password>
API_BASE=https://api.vspphone.com/api
ADMIN_BASE=https://admin.vspphone.com
```

Then run:

```bash
node scripts/platform/verify-rc1-blockers.cjs
node scripts/platform/verify-bff-security.cjs
node scripts/platform/verify-extension-first-runtime.cjs
```

## Workflows to verify (manual + API)

### Platform Admin

| Workflow | API / route |
|----------|-------------|
| Login | `POST /v1/auth/login` |
| Dashboard | `GET /v1/platform/dashboard` |
| Tenants | `GET /v1/platform/tenants` |
| Tenant Detail | `GET /v1/platform/tenants/:id` |
| DID Inventory | `GET /v1/carriers/telnyx/numbers` |
| Provisioning | Wizard at `/provisioning` + `POST .../bulk/assign` |

### Tenant Portal

| Workflow | API |
|----------|-----|
| Login | `POST /v1/auth/login` |
| Extension Hub | `GET /v1/tenant/extensions/hub` |
| Configure | Extension detail APIs |
| Phone Setup / QR | Extension provisioning APIs |
| Voicemail | `GET /v1/tenant/voicemail` |
| Call Handling | `GET /v1/tenant/inbound-routes` |
| Call Logs | `GET /v1/tenant/cdr` |
| Recordings | `GET /v1/tenant/recordings` |

## Provisioning batches (RC1-002 extension)

| Batch | Verify |
|-------|--------|
| 1 DID | Extension, route, tenant detail, Extension Hub |
| 5 DIDs | Partial failure retry if applicable |
| 25 DIDs | Performance acceptable; no timeout |

Run only on staging with disposable test tenant and available DIDs.
