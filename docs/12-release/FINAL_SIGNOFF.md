# RC1 Final Sign-Off — VSP Phone v4

| Field | Value |
|-------|-------|
| **Version** | 4.0.0-rc1 |
| **Date** | 2026-07-09 |
| **Release owner** | VSP Platform Engineering |

---

## Sign-off decision

**VSP Phone v4 RC1 is approved for staging deployment.**

---

## Quality gate

| Gate | Result |
|------|--------|
| RC1 Preparation (2026-07-08) | FAIL |
| RC1 Finalization (2026-07-09) | **PASS** |

See [FINAL_QUALITY_GATE.md](./FINAL_QUALITY_GATE.md).

---

## Blockers resolved

| ID | Description | Status |
|----|-------------|--------|
| B-01 | Monorepo build | ✅ Resolved |
| B-02 | Version `4.0.0-rc1` | ✅ Resolved |
| B-03 | Git metadata documented | ✅ Resolved |
| B-04 | Audit docs refreshed | ✅ Resolved |
| B-05 | docs/05–08 completed | ✅ Resolved |
| B-06 | Troubleshooting guide | ✅ Resolved |

---

## Verification summary

```
npm run build                          PASS
npx nx build api                       PASS
npx nx build admin                     PASS
npx nx lint api                        PASS
npx nx lint admin                      PASS
npm run telecom:validate:phase20       PASS
npm run telecom:validate:remediation   PASS
```

---

## Pre-staging operator checklist

- [ ] Apply git tag `v4.0.0-rc1` (see [RELEASE_MANIFEST.md](./RELEASE_MANIFEST.md))
- [ ] Build Docker images on staging host
- [ ] Configure production secrets (no dev credentials)
- [ ] Run `npx prisma generate` after install
- [ ] Execute [RC1_CHECKLIST.md](./RC1_CHECKLIST.md) on staging

---

## Sign-off table

| Role | Name | Date | Approved |
|------|------|------|----------|
| Platform Engineering | VSP Platform Engineering | 2026-07-09 | ✅ |
| QA | Pending staging execution | | |
| Security | Pending production env review | | |
| Operations | Pending staging deployment | | |

---

## Related documents

- [FINAL_RC1_REPORT.md](./FINAL_RC1_REPORT.md)
- [RELEASE_NOTES_v4.0.0_RC1.md](./RELEASE_NOTES_v4.0.0_RC1.md)
