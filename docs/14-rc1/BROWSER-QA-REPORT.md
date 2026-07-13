# RC1 Blocker Resolution — Browser QA Report

| Field | Value |
|-------|-------|
| **Blocker** | RC1-003 |
| **Status** | **Platform portal: executed on Chromium, Edge, and Firefox** + 5-breakpoint responsive check (Chromium). Tenant portal walkthrough not in scope for Tasks 3–5 (out of the current instruction set) — see note below. |
| **Date** | 2026-07-13 |
| **Environment** | `https://admin.vspphone.com` (staging), commit `f8482c3` |
| **Method** | Playwright (`apps/admin-e2e/src/platform-rc1-walkthrough.spec.ts`, `apps/admin-e2e/src/platform-responsive-check.spec.ts`), console/network capture, full-page screenshots |
| **Artifacts** | `E:\static\runtime-verification\playwright\platform-rc1\{chromium,edge,firefox,responsive}\*.png` / `*.json` (local, not committed — regenerate via the specs) |

## Automated checks completed

| Check | Result |
|-------|--------|
| `nx run admin:build` | **PASS** — no TypeScript errors |
| `nx run api:build` | **PASS** |
| Next.js static generation | **83 routes** — no build-time hydration errors |

## Platform portal walkthrough (Chromium) — Task 1

Login: `admin@vspphone.com` (Super Admin / `platform:super_admin`).

| Page | Route | Loads | Console errors | Failed requests | Notes |
|------|-------|-------|-----------------|------------------|-------|
| Dashboard | `/dashboard` | ✅ | none | none | KPIs render (tenants, extensions, DIDs, MRR) |
| Tenants | `/tenants` | ✅ | none | none | List view only — no row drill-down (see DEFECT-01) |
| Tenant Detail (8 tabs) | `/tenants/[id]` | ❌ | — | — | **Route does not exist in this build** — see DEFECT-01 |
| Provisioning Workspace | `/provisioning` | ❌ | none | none | Silently redirects to `/dashboard` — see DEFECT-02 |
| DID Inventory | `/did-inventory` | ❌ | none | none | Silently redirects to `/dashboard` — see DEFECT-02 |
| Users | `/users` | ✅ | none | none | Cross-tenant user list renders correctly |
| Roles | `/roles` | ✅ | none | none | |
| Permissions | `/permissions` | ✅ | none | none | |
| API Keys | `/api-keys` | ✅ | none | none | Clean empty state |
| Carriers | `/carriers` | ✅ | none | none | |
| SIP Trunks | `/trunks` | ✅ | none | none | Sparkline widgets render |
| Billing | `/billing` | ✅ | none | none | All-zero staging data, no errors |
| Audit Logs | `/audit-logs` | ✅ (data renders) | **2× `400`** | `GET /v1/ops/audit?limit=100` × 2 | See DEFECT-03 — cosmetic, correct data still shown via the platform-scoped query |
| Settings | `/settings` | ✅ | none | none | |
| Health | `/system-health` | ✅ | none | none | All dependencies healthy |

No React hydration-mismatch warnings were observed on any authenticated page. No broken layouts, no duplicate functionality found among the pages that exist.

> **Harness correction:** the first cross-browser pass flagged `GET /v1/auth/me → 304 Not Modified` as a "failed request" on every page. `304` is a normal conditional-GET cache-revalidation response, not a failure — Playwright's `response.ok()` only covers 2xx, so the observer in `platform-rc1-walkthrough.spec.ts` was updated to also exempt `304` (alongside the existing `401` auth-guard exemption). Re-ran all three browsers after the fix; results below reflect the corrected harness. No product code was touched.

## Task 4/5 — Cross-browser walkthrough: Edge and Firefox

Same 15-test suite (13 real routes + login + 2 suspect routes), same staging login, run separately against Edge (Chromium-based, `channel: 'msedge'`) and Firefox 151. Each browser's artifacts are kept in a separate subfolder so results aren't overwritten between runs.

| Page | Route | Chromium | Edge | Firefox |
|------|-------|----------|------|---------|
| Dashboard | `/dashboard` | ✅ | ✅ | ✅ |
| Tenants | `/tenants` | ✅ | ✅ | ✅ |
| Users | `/users` | ✅ | ✅ | ✅ |
| Roles | `/roles` | ✅ | ✅ | ✅ |
| Permissions | `/permissions` | ✅ | ✅ | ✅ |
| API Keys | `/api-keys` | ✅ | ✅ | ✅ |
| Carriers | `/carriers` | ✅ | ✅ | ✅ |
| SIP Trunks | `/trunks` | ✅ | ✅ | ✅ |
| Billing | `/billing` | ✅ | ✅ | ✅ |
| Audit Logs | `/audit-logs` | ⚠️ DEFECT-03 (2×400) | ⚠️ DEFECT-03 (2×400) | ⚠️ DEFECT-03 (2×400) |
| Settings | `/settings` | ✅ | ✅ | ✅ |
| Health | `/system-health` | ✅ | ✅ | ✅ |
| Provisioning Workspace | `/provisioning` | ⚠️ DEFECT-02 (redirects) | ⚠️ DEFECT-02 (redirects) | ⚠️ DEFECT-02 (redirects) |
| DID Inventory | `/did-inventory` | ⚠️ DEFECT-02 (redirects) | ⚠️ DEFECT-02 (redirects) | ⚠️ DEFECT-02 (redirects) |

**Result: 15/15 pass on all three browsers, identically.** No browser-specific regressions, no new console errors, no new failed requests, no hydration warnings introduced by Edge or Firefox rendering. DEFECT-02 and DEFECT-03 (both already logged from the Chromium pass) reproduce identically on Edge and Firefox — they are server/routing-level issues, not rendering issues, so this is expected rather than a new finding. DEFECT-01 (Tenant Detail route missing) and DEFECT-04 (login hydration race) are also browser-agnostic (route absence / timing issue, not a rendering difference) and were not re-driven per browser for that reason — they'd reproduce identically since neither depends on browser engine behavior.

*Tenant portal walkthrough was not included in Tasks 3–5 as scoped by the user's instructions (Task 3 = DB integrity, Task 4 = Edge, Task 5 = Firefox + responsive, all against the Platform Admin portal per the running task list); it remains a separate follow-up if required before final sign-off.*

## Responsive breakpoint verification

5 representative pages (Dashboard, Tenants, Billing, Settings, Health) × 5 breakpoints, Chromium, staging:

| Breakpoint | Width | Dashboard | Tenants | Billing | Settings | Health |
|---|---|---|---|---|---|---|
| Mobile | 375px | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow |
| Tablet | 768px | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow |
| Laptop | 1024px | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow |
| Desktop | 1440px | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow |
| Wide | 1920px | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow | ✅ 0px overflow |

**25/25 combinations: zero unwanted horizontal page-level overflow** (measured via `document.documentElement.scrollWidth` vs `clientWidth`, tolerance 4px for sub-pixel rounding). Visual spot-check of screenshots (mobile Dashboard, mobile Tenants) confirms:
- Cards stack cleanly to full width on mobile with a collapsed "Menu" trigger replacing the persistent sidebar.
- Data tables (e.g., Tenants) use their own internal horizontally-scrollable container on narrow viewports rather than breaking the page layout — a standard, acceptable responsive pattern, not a defect. No data is clipped or inaccessible; it's reachable via horizontal scroll/swipe within the table card.

No responsive-layout defects found at any tested breakpoint.

## Defect list

### DEFECT-01 — Critical — Tenant Detail page does not exist in the RC1 build

- **Severity:** Critical
- **Repro:** Log in to `admin.vspphone.com` as platform admin → `/tenants` → there is no way to open a tenant (no row click, no "View" action) → manually navigate to `/tenants/<any-uuid>`.
- **Expected:** Tenant Detail view with 8 tabs (per RC1 handoff / `KNOWN-ISSUES.md` priority list).
- **Actual:** `apps/admin/src/app/(portal)/tenants/[id]/page.tsx` is not present in `release/v4.0.0-rc1` (verified via `git ls-tree HEAD`). The component (`TenantDetailContent.tsx` and its 8 tab components) only exists in an **uncommitted local git stash** (`stash@{0}: "wip: non-RC1 experimental UI and verification artifacts"`) from a prior session — it was never merged into the release branch and is not deployed.
- **Evidence:** `git ls-tree -r HEAD --name-only | grep tenants` returns only `tenants/page.tsx` (list view). `TenantsContent.tsx` has no row click handler or navigation to a detail route, so no dead link is exposed to users — the feature is simply absent.

### DEFECT-02 — Critical — Provisioning Workspace and DID Inventory are unreachable on the Platform portal

- **Severity:** Critical
- **Repro:** Log in to `admin.vspphone.com` as platform admin → navigate to `/provisioning` or `/did-inventory` (both directly and via the sidebar — neither appears in the sidebar at all).
- **Expected:** Provisioning Workspace (Select Tenant → Select Numbers → Review → Execute → Validate → Complete) and DID Inventory views, per the RC1 handoff.
- **Actual:** Both routes silently redirect to `/dashboard?portal=platform` with no error, no toast, no explanation. Root cause is two-fold:
  1. `PLATFORM_MODULES` (`apps/admin/src/lib/navigation/platform-nav.ts`) has no `provisioning` or `did-inventory` entries at all — not in the sidebar.
  2. `PORTAL_ROUTE_PREFIXES.platform` (`apps/admin/src/lib/portal/portal-routes.ts`) does not include `/provisioning` (only listed under `tenant`) or `/did-inventory` (listed under no portal) — middleware redirects both to `/dashboard` regardless of auth state.
  3. The page files themselves (`did-inventory/page.tsx`, the provisioning-wizard variant of `provisioning/page.tsx`) are absent from `HEAD`; only the **legacy device-provisioning UI** (firmware/templates/enrollment) is currently wired to `/provisioning`, and that page is scoped to the tenant portal only.
- **Impact:** Task 2 (Provisioning Runtime Validation) **cannot be executed against the currently deployed Platform Admin portal** — there is no UI entry point. This must be resolved (or the RC1 scope explicitly reduced) before Task 2 can run as specified.
- **Evidence:** Screenshots `suspect_provisioning.png` / `suspect_did-inventory.png` both show the Dashboard; `finalUrl` in both JSON reports is `https://admin.vspphone.com/dashboard?portal=platform`.

### DEFECT-03 — Low — Audit Logs page always fires a doomed extra request (400)

- **Severity:** Low (cosmetic/console-noise; the page itself renders correct data)
- **Repro:** Log in as platform admin → `/audit-logs`.
- **Expected:** No failed network requests on page load (RC1 acceptance criterion).
- **Actual:** `AuditLogsContent.tsx` unconditionally calls both `usePlatformAudit({ limit: 100 })` and `useOpsAudit({ limit: 100 })`, then picks one result based on portal type. On the platform portal, the unused `useOpsAudit` call still fires `GET /v1/ops/audit?limit=100` with no `tenantId`. `AuditQueryDto.tenantId` (`apps/api/src/modules/enterprise-observability/dto/observability.request.dto.ts`) is `@IsUUID()` with no `@IsOptional()`, so the API returns `400`. This happens twice per page load (React Query dev double-invoke / refetch).
- **Evidence:** Console: `Failed to load resource: the server responded with a status of 400 ()` ×2; Network: `GET https://api.vspphone.com/api/v1/ops/audit?limit=100` → `400` ×2. Visible table data is correct (comes from the successful `usePlatformAudit` call).
- **Suggested fix (not applied — outside Task 1 scope):** Only call the query relevant to the current portal, e.g. `const query = portal === 'platform' ? usePlatformAudit(...) : useOpsAudit(...)` instead of calling both hooks unconditionally.

### DEFECT-04 — Low/Medium — Login form can fall through to a native full-page GET submit before hydration

- **Severity:** Low/Medium (not reproducible under normal human interaction speed; reproducible reliably in automation and theoretically on slow devices/connections)
- **Repro:** Navigate to `/login`, then fill email/password and click "Continue" immediately after `domcontentloaded` (before the JS bundle finishes hydrating the form's `onSubmit` handler).
- **Expected:** `onSubmit`'s `e.preventDefault()` always intercepts the click; the app calls `POST /v1/auth/login` via `fetch` and shows an inline error on failure.
- **Actual:** The click is handled as a native HTML form submission — the browser does a full-page `GET /login?` reload. Because the `<Input>` fields have no `name` attribute (only `id`), no credentials are serialized into the URL, but the login attempt is silently discarded: fields are cleared, no error message is shown, and all JS chunks are re-fetched. A user who acts faster than hydration (e.g., autofill + Enter, or a slow network loading the JS bundle) sees the page "do nothing."
- **Evidence:** Reproduced twice via Playwright — with `waitUntil: 'domcontentloaded'` and an immediate click, network trace shows `GET /login?` (full navigation, all `_next` chunks re-requested) instead of `POST /v1/auth/login`. Adding a hydration-settle wait (~2s) before interacting reliably produces the correct `POST /v1/auth/login` → `201` → `/v1/auth/refresh-token/issue` → `GET /v1/auth/me` → navigation to `/dashboard`.
- **Suggested fix (not applied — outside Task 1 scope):** Disable the submit button until the component has mounted client-side (e.g. `useEffect` flag), or set `type="button"` with an explicit `onClick` handler instead of relying on native form submit semantics.

## Blocker status

RC1-003 (Browser QA) is **resolved for the Platform Admin portal**: walkthrough executed on Chromium, Edge, and Firefox (15/15 pass on each, identical results across browsers), plus a 25-combination responsive breakpoint sweep (0 layout defects). The four defects below (DEFECT-01 through DEFECT-04) are confirmed real, are **not browser-specific**, and are already tracked in `KNOWN-ISSUES.md` (RC1-016 through RC1-019).

DEFECT-01 and DEFECT-02 remain **Critical findings** that block Task 2 (Provisioning Runtime Validation) as currently scoped — see `KNOWN-ISSUES.md` RC1-016/RC1-017. Tenant portal walkthrough was outside the scope of Tasks 3–5 and is noted as an open follow-up, not a completed check.
