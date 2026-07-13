# RC1 Final Regression Summary

| Field | Value |
|-------|-------|
| **Version** | v4.0.0-rc1 |
| **Date** | 2026-07-13 |
| **Release commit** | Branch tip of `release/v4.0.0-rc1` (`f8482c3`, supersedes `ee3f990`) |
| **Environment tested** | `https://admin.vspphone.com` (staging) |
| **Scope of this pass** | Task 3 (DB integrity), Task 4 (Edge QA), Task 5 (Firefox QA + responsive) |

## Overall recommendation: **CONDITIONAL — NOT YET READY FOR RC1**

The security, deployment, and cross-browser/responsive rendering work is **solid and complete**. What remains open are **pre-existing product gaps** (not introduced by, or discovered as regressions from, this pass) that block full sign-off:

1. Two **Critical, browser-agnostic** UI gaps (Tenant Detail missing; Provisioning Workspace/DID Inventory unreachable on the Platform portal) — confirmed identically on Chromium, Edge, and Firefox.
2. **Database integrity** could not be executed from this environment — **Blocked – Environment Access**, not a finding of bad data.
3. **Task 2 (Provisioning Runtime Validation)** remains explicitly **paused** pending external confirmation of the staging Telnyx account/billing status (the API key on staging is live — real cost/irreversible carrier mutation risk).

None of the above are regressions caused by this session's work. All are carried over from earlier in the RC1 hardening effort and are already tracked in `KNOWN-ISSUES.md`.

---

## Task-by-task results

### Task 1 — Platform Browser Verification (Chromium) — done previously, referenced here

15/15 pages load without hydration errors. 4 defects found (see below). Full detail: `BROWSER-QA-REPORT.md`.

### Task 2 — Provisioning Runtime Validation — **PAUSED (external approval required)**

- Audit found the "missing" provisioning UI only exists in an **uncommitted local git stash** that also contains a broad, out-of-scope Phase 3B navigation/IA redesign — merging it would violate the architecture/IA freeze.
- Plan pivoted to validating provisioning via the existing `bulk/assign` API + its UI, which **is** in `HEAD` and functionally complete (creates extension + SIP line + inbound route per DID, dedupes).
- Before executing, discovered staging's `TELNYX_API_KEY` is **live** — any `purchase`/`release` call is a real, billable, irreversible carrier operation. Paused and flagged to the user rather than risk real-world side effects.
- **No Telnyx mutations have been made.** Batches (1/5/25 DIDs), retry/dedupe tests, and the orphan-record recheck are still pending resumption.

### Task 3 — Database Integrity — **Blocked – Environment Access**

- `scripts/platform/db-integrity-verification.sql` is read-only and unmodified — ready to run.
- No execution path exists from this workstation:
  - SSH to the EC2 host: `Permission denied (publickey)` (no key configured here).
  - Direct TCP to staging Postgres (`32.196.41.160:5432`): unreachable (`TcpTestSucceeded: False` — correctly firewalled).
  - Local `.env` `DATABASE_URL` targets this machine's own dev database, not staging (`password authentication failed for user "vsp"` when tried, as expected).
- **This is the exact "cannot be reached" case the task instructions called out** — recorded as Blocked, not a product defect, and no data was touched.
- Unblock path (no code change): someone with EC2 access runs one command (`docker exec -i vsp-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/platform/db-integrity-verification.sql`) and pastes the output back, or grants this agent SSH/a scoped read-only `DATABASE_URL`. Full detail: `DATABASE-INTEGRITY-REPORT.md`.

### Task 4 — Edge Browser QA (Platform portal) — **PASS**

15/15 tests pass on Edge (`channel: 'msedge'`), results **identical** to Chromium: same pages load cleanly, same two pre-existing defects (DID Inventory/Provisioning redirect, Audit Logs 400) reproduce identically, no new console errors, no new failed requests, no hydration warnings. Full detail: `BROWSER-QA-REPORT.md`.

### Task 5 — Firefox Browser QA + Responsive Breakpoints — **PASS**

- Firefox 151: 15/15 tests pass, results identical to Chromium/Edge.
- Responsive: 5 breakpoints (375 / 768 / 1024 / 1440 / 1920) × 5 representative pages (Dashboard, Tenants, Billing, Settings, Health) = **25/25 combinations with zero unwanted horizontal overflow**. Visual spot-check confirms clean mobile stacking and correctly-contained (not page-breaking) table scroll on narrow viewports.
- Along the way, found and fixed a **false positive in the test harness itself** (it flagged normal HTTP `304 Not Modified` cache-revalidation responses as "failed requests"). Fixed the observer to exempt `304` alongside the existing `401` exemption, then re-ran all three browsers clean. This was a test-script bug, not a product bug — no application code was touched.

---

## Defect rollup (all confirmed browser-agnostic — reproduce identically on Chromium/Edge/Firefox)

| ID | Severity | Summary | RC1 blocking? |
|----|----------|---------|----------------|
| RC1-016 (DEFECT-01) | Critical | Tenant Detail page (`/tenants/[id]`, 8 tabs) not in the deployed build — only in an uncommitted stash | **Yes** — decide: commit+deploy the (isolated) component, or formally descope from RC1 |
| RC1-017 (DEFECT-02) | Critical | Provisioning Workspace + DID Inventory unreachable on Platform portal (redirect to dashboard) | **Yes** — same decision as above; also blocks Task 2 as originally specified |
| RC1-020 | High | DB integrity script could not be run from this environment | **Environment access, not a defect** — needs someone with EC2/staging DB access to run one command |
| RC1-018 (DEFECT-03) | Low | Audit Logs page fires an extra doomed `400` request (cosmetic only, correct data still shown) | No |
| RC1-019 (DEFECT-04) | Low/Medium | Login form can fall through to a native GET submit if interacted with before hydration completes (not reproducible at normal typing speed) | No |

Full defect narratives, repro steps, and evidence: `BROWSER-QA-REPORT.md`.

---

## What changed in this session (for the record)

- `apps/admin-e2e/src/platform-rc1-walkthrough.spec.ts`: fixed a false-positive (304 treated as failure); parametrized artifact output directory per browser (`PW_BROWSER_TAG`) so Chromium/Edge/Firefox runs no longer overwrite each other's screenshots/JSON.
- `apps/admin-e2e/src/platform-responsive-check.spec.ts`: new spec for the 5×5 responsive sweep.
- `apps/admin-e2e/playwright.local.config.mts`: added `edge` (`channel: 'msedge'`) and `firefox` projects.
- `docs/14-rc1/DATABASE-INTEGRITY-REPORT.md`, `BROWSER-QA-REPORT.md`, `KNOWN-ISSUES.md`, `RELEASE-CHECKLIST.md`: updated with the above results.
- No application/product code, no Prisma schema, no navigation, no API contracts were modified. No Telnyx or database mutations were performed.

---

## Recommendation to reach full RC1 sign-off

1. **Decide on RC1-016/RC1-017** (Tenant Detail, Provisioning Workspace, DID Inventory): either extract just those components from the stash — without the entangled Phase 3B nav/IA redesign — and ship them, or formally descope them from RC1 and communicate the reduced scope to stakeholders.
2. **Confirm Telnyx staging account/billing status** so Task 2 can resume safely, then run the 1/5/25-DID batches and the post-batch orphan-record check.
3. **Get the DB integrity script run** on staging (one command, read-only, ~instant) via someone with EC2 access, or grant this agent a scoped path in; update `DATABASE-INTEGRITY-REPORT.md` with real PASS/FAIL results.
4. Optionally: tenant portal Edge/Firefox/responsive pass (this session only covered the Platform portal, per the Task 3–5 scope given).

Once 1–3 are closed, this becomes a clean **READY FOR RC1** based on everything verified so far — the codebase, security posture, and cross-browser/responsive behavior of every page that does exist are solid.
