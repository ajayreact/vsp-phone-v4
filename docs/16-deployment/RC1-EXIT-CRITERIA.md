# RC1 Exit Criteria & Promotion Rules

| Field | Value |
|-------|-------|
| **Status** | Feature freeze ACTIVE |
| **Authority** | [RC1-GOVERNANCE.md](./RC1-GOVERNANCE.md) |
| **Current gate** | **RC Approved for Internal Testing** |
| **Next gate** | Customer Pilot (staging certification) |
| **Owner** | Platform / SRE + Telecom ops |

**No product development is authorized.** See [RC1-GOVERNANCE.md](./RC1-GOVERNANCE.md) for Allowed / Not allowed and the mandatory restart-on-failure promotion process.

---

## Current status matrix

| Area | Status |
|------|--------|
| Multi-tenant security | PASS |
| Tenant isolation | PASS |
| Extension architecture | PASS |
| Auto provisioning | PASS |
| User management | PASS |
| Device lifecycle | PASS |
| Production cleanup | PASS |
| Feature freeze | PASS (ACTIVE) |
| Infrastructure validation | Pending |
| Environment validation | Pending |
| Staging smoke | Pending |
| Live PSTN / PBX validation | Pending |
| Load testing | Pending |

---

## Promotion rules (hard gates)

| Gate | Classification | Must be true |
|------|----------------|--------------|
| **Internal Testing** | Current | Security suites PASS + ops docs + feature freeze |
| **Customer Pilot** | All must be true | Infra · Env · Migrations · Inventory · Smoke · Live call lab · Device provisioning · No Critical/High defects · Security regressions |
| **General Availability** | All must be true | Customer Pilot complete · Load targets met · Monitoring/alerting operational · Backup/recovery verified · **14 consecutive days** with no Critical/High defects · Final release sign-off |

**Do not promote** unless every required gate is satisfied. Partial greens do not count. If any promotion command fails: stop, file a defect report, fix only the blocker, restart from `platform:ensure-inventory`.

---

## Customer Pilot exit checklist

### 1. Infrastructure

- [ ] PostgreSQL authentication works (`DATABASE_URL`)
- [ ] Redis reachable (`REDIS_URL`)
- [ ] `npx prisma migrate deploy` succeeded
- [ ] Platform Inventory tenant exists (`npm run platform:ensure-inventory`)
- [ ] `npm run platform:rc1-infra` → **PASS**
  - No duplicate DIDs
  - No duplicate extensions
  - No orphan routes
  - No soft-deleted devices retaining MAC

### 2. Environment

```bash
RC1_PROFILE=production npm run platform:rc1-env
```

Must be set (non-exhaustive; script is authoritative):

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Yes |
| `REDIS_URL` | Yes |
| `JWT_SECRET` | Yes (prod) |
| `TELNYX_API_KEY` | Yes |
| `VSP_PLATFORM_INVENTORY_TENANT_ID` | Yes |
| `CORS_ORIGINS` | Yes |
| `SMTP_HOST` / `SMTP_FROM_EMAIL` | Yes |
| `KAMAILIO_WSS_PORT` / `KAMAILIO_REQUIRE_SERVICE_AUTH` | Yes |
| `RTPENGINE_HOST` / `RTPENGINE_NG_PORT` | Yes |
| `S3_*` | If recordings enabled |
| `MIGRATION_DEV_SUPER_ADMIN` | Must be `false` or unset (never `true` in prod) |

**Fail deployment** if `platform:rc1-env` exits non-zero.

### 3. Staging smoke (all steps PASS)

```bash
npm run platform:ensure-inventory
npx prisma migrate deploy
npm run platform:rc1-infra
RC1_PROFILE=production npm run platform:rc1-env
API_BASE=... PLATFORM_EMAIL=... PLATFORM_PASSWORD=... npm run platform:pilot-smoke
CALL_LAB_RESULT=PASS npm run platform:rc1-validate
```

Smoke must cover: create tenant/admin → login → DID purchase/assign → extensions 100–102 → rename → users → assign → provision → softphone path → CDR/VM/recording APIs → impersonation → device delete → MAC re-enroll.

### 4. Live PBX validation

Complete and sign [RC1-CALL-LAB-REPORT.md](./RC1-CALL-LAB-REPORT.md), then set `CALL_LAB_RESULT=PASS`.

| Flow | Required for Customer Pilot |
|------|----------------------------|
| Extension ↔ Extension | Yes |
| PSTN inbound | Yes |
| PSTN outbound | Yes |
| Registration | Yes |
| Grandstream provisioning | Yes |
| Voicemail | Yes (if sold) |
| Recording | Yes (if sold) |
| Ring Groups | Yes (if sold) |
| IVR | Yes (if sold) |
| Impersonation | Yes |
| Device delete + MAC re-enroll | Yes |
| Attended transfer | Document; not a pilot blocker if blind transfer works |

### 5. Performance (required before GA)

```bash
npm run platform:pilot-load
```

Targets: 100 / 500 / 1,000 tenants · 10,000 extensions — capture p50/p95/p99, CPU, memory, Postgres, Redis in [PERFORMANCE-REPORT.md](./PERFORMANCE-REPORT.md).

### 6. General Availability (after Customer Pilot)

Approve GA only when all are true:

- [ ] Customer Pilot completed successfully  
- [ ] Load testing meets performance targets  
- [ ] Monitoring and alerting are operational  
- [ ] Backup and recovery are verified  
- [ ] 14 consecutive days with no Critical or High severity production defects (`RC1_SOAK_14_DAYS=PASS`)  
- [ ] Final release sign-off completed (product + SRE + telecom)  

---

## Final deliverables (must exist)

| Deliverable | Path |
|-------------|------|
| RC1 Governance (binding) | [RC1-GOVERNANCE.md](./RC1-GOVERNANCE.md) |
| Infrastructure Report | [RC1-INFRASTRUCTURE-REPORT.md](./RC1-INFRASTRUCTURE-REPORT.md) |
| Environment Validation Report | [RC1-ENV-VALIDATION-REPORT.md](./RC1-ENV-VALIDATION-REPORT.md) |
| Smoke Test Report | [STAGING-PILOT-SMOKE-REPORT.md](./STAGING-PILOT-SMOKE-REPORT.md) |
| Call Lab Report | [RC1-CALL-LAB-REPORT.md](./RC1-CALL-LAB-REPORT.md) |
| Load Test Report | [PERFORMANCE-REPORT.md](./PERFORMANCE-REPORT.md) |
| Security Report | [RC1-SECURITY-REPORT.md](./RC1-SECURITY-REPORT.md) |
| Production Deployment Checklist | [RC1-OPERATIONAL-READINESS.md](./RC1-OPERATIONAL-READINESS.md) + [AWS-DEPLOYMENT-CHECKLIST.md](./AWS-DEPLOYMENT-CHECKLIST.md) |
| Rollback Checklist | [ROLLBACK.md](./ROLLBACK.md) |
| Operations Runbook | [OPERATIONS-RUNBOOK.md](./OPERATIONS-RUNBOOK.md) |
| Master RC Report | [RC1-RELEASE-CANDIDATE-REPORT.md](./RC1-RELEASE-CANDIDATE-REPORT.md) |
| Feature Freeze | [FEATURE-FREEZE.md](./FEATURE-FREEZE.md) |

---

## Orchestrator

```bash
# Staging certification (set CALL_LAB_RESULT after live lab)
API_BASE=... PLATFORM_EMAIL=... PLATFORM_PASSWORD=... \
CALL_LAB_RESULT=PASS \
npm run platform:rc1-validate

# GA soak (after 14 clean days)
RC1_SOAK_14_DAYS=PASS CALL_LAB_RESULT=PASS npm run platform:rc1-validate
```

Classification is printed at the end of `platform:rc1-validate` and written into the master RC report.
