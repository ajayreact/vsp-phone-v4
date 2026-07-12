# RC1 Hardening — Documentation Index

| Field | Value |
|-------|-------|
| **Version** | v4.0.0-rc1 |
| **Phase** | Feature freeze → Release Candidate 1 |
| **Date** | 2026-07-13 |

This folder contains RC1 operational documentation produced during the hardening phase. For legacy Phase 20 cutover docs, see `docs/10-production/` and `docs/12-release/`.

## Documents

| Document | Purpose |
|----------|---------|
| [DEPLOYMENT-RUNBOOK.md](./DEPLOYMENT-RUNBOOK.md) | Deploy RC1 to staging/production |
| [ROLLBACK-PLAN.md](./ROLLBACK-PLAN.md) | Roll back a failed deploy |
| [ENVIRONMENT-VARIABLES.md](./ENVIRONMENT-VARIABLES.md) | Required and optional env vars |
| [PROVISIONING-GUIDE.md](./PROVISIONING-GUIDE.md) | Platform provisioning wizard |
| [TENANT-ONBOARDING-GUIDE.md](./TENANT-ONBOARDING-GUIDE.md) | Onboard a new tenant |
| [PLATFORM-ADMIN-GUIDE.md](./PLATFORM-ADMIN-GUIDE.md) | Platform admin daily operations |
| [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) | Known limitations and defects |
| [RELEASE-NOTES-RC1.md](./RELEASE-NOTES-RC1.md) | RC1 release notes |
| [RELEASE-CHECKLIST.md](./RELEASE-CHECKLIST.md) | Pre-release sign-off checklist |
| [RC1-HARDENING-REPORT.md](./RC1-HARDENING-REPORT.md) | Full hardening audit report |
| [SECURITY-FIX-REPORT.md](./SECURITY-FIX-REPORT.md) | RC1-001 BFF security fix |
| [STAGING-VERIFICATION-REPORT.md](./STAGING-VERIFICATION-REPORT.md) | RC1-002 live verification |
| [BROWSER-QA-REPORT.md](./BROWSER-QA-REPORT.md) | RC1-003 browser checklist |
| [DATABASE-INTEGRITY-REPORT.md](./DATABASE-INTEGRITY-REPORT.md) | P1 DB integrity |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/platform/db-integrity-verification.sql` | PostgreSQL integrity checks |
| `scripts/platform/verify-extension-first-runtime.cjs` | API provisioning E2E |
| `scripts/platform/probe-production-readonly.cjs` | Read-only health + auth probe |
