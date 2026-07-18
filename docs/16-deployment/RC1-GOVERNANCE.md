# RC1 Final Instruction — Release Candidate Governance

| Field | Value |
|-------|-------|
| **Effective** | 2026-07-17 |
| **Status** | **BINDING** |
| **Current classification** | RC Approved for Internal Testing |
| **Product development** | **NOT AUTHORIZED** |

This document is the controlling authority for change control and promotion through Customer Pilot and General Availability.

---

## 1. Change control

### Allowed

| Category | Examples |
|----------|----------|
| Critical bug fixes | P0/P1 defects that block staging certification or pilot safety |
| Security fixes | Auth, isolation, IDOR, secrets, dependency CVEs |
| Deployment fixes | Compose, migrate, health/ready, deploy scripts |
| Environment configuration fixes | Required env vars, inventory tenant wiring |
| Performance optimizations | Latency/CPU/memory fixes with measured before/after |
| Logging and monitoring improvements | Metrics, alerts, structured logs |
| Documentation updates | Runbooks, checklists, RC reports |

### Not allowed

| Category | Notes |
|----------|-------|
| New PBX features | Queues, IVR nodes, conference modes, dialplan features, etc. |
| UI redesigns | Layout, IA, visual redesigns |
| Database redesigns | Non-critical schema changes |
| API contract changes | Unless required to fix a critical defect |
| New workflows | Product or onboarding flows beyond certification |
| Refactoring unrelated modules | No drive-by cleanups |

Any PR outside the Allowed list **must be rejected** until governance is lifted after GA sign-off (or an explicit written exception from the product owner for a critical defect).

---

## 2. Promotion process (only approved path)

Execute **in order** on the staging (or production cutover) host:

```bash
npx prisma migrate deploy
npx prisma migrate deploy
npm run platform:rc1-infra
RC1_PROFILE=production npm run platform:rc1-env
API_BASE=... PLATFORM_EMAIL=... PLATFORM_PASSWORD=... npm run platform:pilot-smoke

# Execute live PBX call laboratory (manual sign-off)
# Update docs/16-deployment/RC1-CALL-LAB-REPORT.md

CALL_LAB_RESULT=PASS npm run platform:rc1-validate
```

### On any failure

1. **Stop** the promotion immediately.  
2. **Generate a defect report** (severity, failing command, logs, owner, fix plan).  
3. **Fix only** the blocking issue (Allowed categories only).  
4. **Restart validation from the beginning** of the sequence above.  

Do not skip steps. Do not continue past a red command.

---

## 3. Customer Pilot exit criteria

Approve **Customer Pilot** only when **all** of the following are true:

- [ ] Infrastructure validation passes (`npm run platform:rc1-infra`)
- [ ] Environment validation passes (`RC1_PROFILE=production npm run platform:rc1-env`)
- [ ] Database migrations succeed (`npx prisma migrate deploy`)
- [ ] Global Inventory model active (`owner_tenant_id`; no active inventory tenant)
- [ ] Smoke tests pass (`npm run platform:pilot-smoke`)
- [ ] Live call laboratory passes (`CALL_LAB_RESULT=PASS` + signed [RC1-CALL-LAB-REPORT.md](./RC1-CALL-LAB-REPORT.md))
- [ ] Device provisioning succeeds (including MAC delete + re-enroll)
- [ ] No critical or high-severity defects remain
- [ ] Security regression tests pass

Classification target: `CALL_LAB_RESULT=PASS npm run platform:rc1-validate` → **RC Approved for Customer Pilot**

---

## 4. General Availability exit criteria

Approve **General Availability** only when **all** of the following are true:

- [ ] Customer Pilot completes successfully
- [ ] Load testing meets performance targets (`npm run platform:pilot-load` + signed [PERFORMANCE-REPORT.md](./PERFORMANCE-REPORT.md))
- [ ] Monitoring and alerting are operational
- [ ] Backup and recovery are verified
- [ ] **14 consecutive days** with no Critical or High severity production defects (`RC1_SOAK_14_DAYS=PASS`)
- [ ] Final release sign-off is completed (product + SRE + telecom)

Classification target:  
`RC1_SOAK_14_DAYS=PASS CALL_LAB_RESULT=PASS npm run platform:rc1-validate` → **RC Approved for General Availability**

---

## 5. Defect report template (promotion failure)

```markdown
# Defect — RC1 Promotion Blocker

| Field | Value |
|-------|-------|
| Date | |
| Failing command | |
| Environment | staging / production |
| Severity | Critical / High |
| Symptom | |
| Evidence (logs / HTTP / SQL) | |
| Suspected cause | |
| Fix (Allowed category only) | |
| Owner | |
| Retest plan | Restart full promotion sequence |

## Resolution
- [ ] Fix merged
- [ ] Full sequence re-run from `prisma migrate deploy`
- [ ] All steps green
```

Store under `docs/16-deployment/defects/` (see [DEFECT-REGISTER.md](./defects/DEFECT-REGISTER.md)) or your issue tracker; link from the master RC report.

---

## 6. Related documents

| Doc | Role |
|-----|------|
| [FEATURE-FREEZE.md](./FEATURE-FREEZE.md) | Change-control summary |
| [RC1-EXIT-CRITERIA.md](./RC1-EXIT-CRITERIA.md) | Checklists + deliverables |
| [OPERATIONS-RUNBOOK.md](./OPERATIONS-RUNBOOK.md) | Staging ops sequence |
| [RC1-RELEASE-CANDIDATE-REPORT.md](./RC1-RELEASE-CANDIDATE-REPORT.md) | Current classification |
| [ROLLBACK.md](./ROLLBACK.md) | Rollback procedure |
