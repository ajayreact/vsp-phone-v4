# Extension-First Runtime Verification Report

**Date:** 2026-07-11  
**Branch:** `release/v4.0.0-rc1` (local working tree — extension-first changes **uncommitted**)  
**Verifier:** Automated + manual API probes  
**Commit gate:** `feat(tenant-portal): extension-first enterprise tenant experience` — **NOT READY**

---

## Executive summary

| Area | Status |
|------|--------|
| Static builds (`api:build`, `admin:build`) | **PASS** |
| Production API (`api.vspphone.com`) — new hub endpoints | **FAIL** — not deployed |
| Local API runtime | **BLOCKED** — DB auth failure + no Redis |
| Full 8-scenario E2E | **NOT COMPLETE** |
| Commit / merge to RC1 | **DO NOT COMMIT YET** |

The implementation direction and code structure are correct, but **runtime verification cannot pass** until:

1. Extension-first API + admin changes are **deployed** to the target environment (or local DB/Redis are fixed), and  
2. A **tenant admin test account** is available for UI flows (`TENANT_EMAIL` / `TENANT_PASSWORD`).

---

## Environment observed

| Component | State |
|-----------|--------|
| Production API | `https://api.vspphone.com/api` — health **200 OK** |
| Production tenant UI | `https://tenant.vspphone.com` — login/extensions pages **200** |
| Local admin dev | `http://localhost:3001` — **running** |
| Local API | `http://localhost:3000` — **crashed** (Postgres auth failed for user `vsp`, DB `vsp_phone_v4`) |
| Redis (local) | **Not listening** on :6379 |
| Docker | **Not available** on this workstation |

Local `.env` points `NEXT_PUBLIC_API_URL` at **production API**, so local admin UI talks to **production backend** (which lacks new hub routes).

---

## Production API probe (read-only)

```
GET /health                              → 200 ok
POST /v1/auth/login (platform admin)     → 201 token issued
GET /v1/tenant/extensions/hub            → 500 An unexpected error occurred
GET /v1/tenant/extensions/hub/stats      → 404 Cannot GET .../hub/stats
GET /v1/carriers/telnyx/numbers/dashboard → 200 OK
GET /v1/carriers/telnyx/numbers/requests  → 200 OK
```

**Interpretation:** Production is running pre–extension-first API (`hub/stats` route missing entirely). The partial `/hub` route returning 500 suggests a mixed or incomplete deploy — **not safe for E2E sign-off**.

---

## Test results (8 scenarios)

### Test 1 — Platform → Tenant auto provision

| Step | Result | Notes |
|------|--------|-------|
| Platform bulk assign 5 DIDs, startExtension=101 | **NOT RUN** | Requires mutating production inventory + deployed auto-provision API |
| Auto-create 101–105 without users | **NOT VERIFIED** | Code present locally (`ExtensionAutoProvisionService`, bulk assign DTO) |
| Labels `101 • Extension 101` … `105 • Extension 105` | **NOT VERIFIED** | Depends on Test 1 + hub API |

### Test 2 — Tenant portal landing

| Step | Result | Notes |
|------|--------|-------|
| Login → `/extensions` (not `/dashboard`) | **NOT RUN** | No tenant credentials in env; production API hub fails |
| KPI cards load | **NOT RUN** | `hub/stats` → 404 on production |
| Extensions table loads | **NOT RUN** | `hub` → 500 on production |
| No console / network errors | **PARTIAL PASS** | Login smoke: 0 console errors; `/extensions` auth guard works (see artifacts) |

### Test 3 — Rename to Reception

| Step | Result | Notes |
|------|--------|-------|
| Rename 101 → Reception | **NOT RUN** | Requires authenticated tenant session + working hub API |
| Label propagation (DID routing, queues, BLF, etc.) | **NOT RUN** | Frontend label helpers implemented locally; not exercised at runtime |

### Test 4 — QR Login

| Step | Result | Notes |
|------|--------|-------|
| QR generate / expiry / regenerate / deep link | **NOT RUN** | `POST .../mobile-qr` not verified against live API |

### Test 5 — Desk phone manufacturer fields

| Step | Result | Notes |
|------|--------|-------|
| Grandstream / Yealink / Fanvil field toggling | **NOT RUN** | `DeviceModelFields.tsx` implemented; UI not exercised with auth |

### Test 6 — DID assignment / removal

| Step | Result | Notes |
|------|--------|-------|
| Assign / unassign DID + inbound route | **NOT RUN** | Requires tenant session + inventory |

### Test 7 — Full call flow

| Step | Result | Notes |
|------|--------|-------|
| Assign → rename → QR → register → call → transfer → VM → CDR | **NOT RUN** | Requires Kamailio/RTPengine/WebRTC lab (correctly out of scope for UI-only host) |

### Test 8 — Regression

| Module | Production API probe | Result |
|--------|-------------------|--------|
| Telnyx Mission Control | `/v1/carriers/telnyx/numbers/dashboard` | **PASS** 200 |
| Number Marketplace | search endpoint (via existing verify script) | **PASS** (prior) |
| Number Requests | `/v1/carriers/telnyx/numbers/requests` | **PASS** 200 |
| Extensions Hub | `/v1/tenant/extensions/hub` | **FAIL** 500 |
| Extensions Hub Stats | `/v1/tenant/extensions/hub/stats` | **FAIL** 404 |
| Devices / Queues / Ring Groups / IVR / Call Routing | Not probed with tenant token | **INCONCLUSIVE** |

---

## UI smoke (completed — 2/2 PASS)

Playwright smoke against local admin (`http://localhost:3001`):

| Check | Result |
|-------|--------|
| Login page renders (`Continue` button) | **PASS** |
| `/extensions` redirects unauthenticated users to login | **PASS** |
| Console errors on login page | **PASS** (empty — see JSON) |
| Failed API requests on login page | **PASS** (empty — see JSON) |

**Note:** Authenticated extension hub UI tests require `TENANT_EMAIL` + `TENANT_PASSWORD` and a backend with `/v1/tenant/extensions/hub` + `/hub/stats` deployed.

- `static/runtime-verification/playwright/00-login-page.png`
- `static/runtime-verification/playwright/00-extensions-guard.png`
- `static/runtime-verification/playwright/smoke-console-errors.json`
- `static/runtime-verification/playwright/smoke-failed-requests.json`

---

## Browser console / network (smoke)

See JSON artifacts above. Unauthenticated smoke had **no blocking console errors** on the login page. Network calls to production API during unauthenticated views should be reviewed in `smoke-failed-requests.json`.

---

## Remaining issues (must fix before commit)

1. **Deploy gap:** Production API does not expose `GET /v1/tenant/extensions/hub/stats` (404) and `/hub` returns 500 — extension-first backend not on production.
2. **Uncommitted work:** Extension-first files are still local (`ExtensionsHubContent`, migration `20260711130000_extension_first_line_user_optional`, hub service changes, etc.).
3. **Local runtime blocked:** Postgres credentials in `.env` reject `vsp` user against `vsp_phone_v4`; Redis not running; API process exits.
4. **E2E credentials:** Set `TENANT_EMAIL` / `TENANT_PASSWORD` (or run onboard flow) for Playwright tests in `apps/admin-e2e/src/extension-first-runtime.spec.ts`.
5. **Test 7 (telecom):** Requires SIP/media stack — schedule on EC2 lab after API deploy.
6. **Production mutation tests** were intentionally not auto-run against shared inventory.

---

## Recommended next steps

1. **Fix local lab** OR **deploy to EC2/staging:**
   ```bash
   git add … # extension-first changes
   # deploy api + admin containers
   npx prisma migrate deploy
   ```
2. **Re-run verification:**
   ```bash
   API_BASE=https://api.vspphone.com/api \
   PLATFORM_EMAIL=... PLATFORM_PASSWORD=... \
   node scripts/platform/verify-extension-first-runtime.cjs

   TENANT_EMAIL=... TENANT_PASSWORD=... \
   BASE_URL=https://tenant.vspphone.com \
   npx playwright test -c apps/admin-e2e/playwright.local.config.mts
   ```
3. Only after all 8 tests pass → commit with message:
   `feat(tenant-portal): extension-first enterprise tenant experience`

---

## Scripts added for verification

| Script | Purpose |
|--------|---------|
| `scripts/platform/probe-production-readonly.cjs` | Read-only production endpoint probe |
| `scripts/platform/verify-extension-first-runtime.cjs` | Full API E2E (mutating — run only on staging) |
| `apps/admin-e2e/src/extension-first-runtime.spec.ts` | Authenticated UI E2E |
| `apps/admin-e2e/src/extension-first-smoke.spec.ts` | Unauthenticated UI smoke |
| `apps/admin-e2e/playwright.local.config.mts` | Playwright config when admin already running |
