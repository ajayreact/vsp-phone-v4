# VSP Phone 5 — RC1 Release Candidate Report

| Field | Value |
|-------|-------|
| Generated | 2026-07-17 |
| Certification target | **AWS EC2 staging only** |
| Classification | **RC Approved for Internal Testing** |
| Staging certification | **Standing by** — operator executing on AWS EC2 |
| ENV-01 | **CLOSED** (localhost discarded; do not reopen) |
| ENV-02 | Operator access limitation (not an application defect) |
| Governance | [RC1-GOVERNANCE.md](./RC1-GOVERNANCE.md) |
| Defect register | [defects/DEFECT-REGISTER.md](./defects/DEFECT-REGISTER.md) |

---

## Final decision

| Classification | Decision |
|----------------|----------|
| RC Rejected | No |
| **RC Approved for Internal Testing** | **YES — current** |
| **RC Approved for Customer Pilot** | **No** |
| RC Approved for General Availability | **No** |

---

## Certification run (AWS restart)

| Phase | Status | Detail |
|-------|--------|--------|
| Target selection | **PASS** | AWS only; localhost out of scope |
| ENV-01 | **CLOSED** | Operator verified AWS Postgres/`vsp`/`vsp_phone_v4` |
| AWS API health/ready | **PASS** | `https://api.vspphone.com/api` → 200 |
| Phase 1 ensure-inventory / migrate / rc1-infra | **NOT RUN** | [ENV-02](./defects/20260717-ENV-02-aws-operator-session.md) — no SSH / no AWS `DATABASE_URL` in agent |
| Phase 2 env | **NOT RUN** | Blocked by ENV-02 |
| Phase 3 smoke | **NOT RUN** | Blocked by ENV-02 (also needs `PLATFORM_*`) |
| Phase 4 call lab | **NOT RUN** | Blocked |
| Phase 5–7 / final validate | **NOT RUN** | Blocked |

---

## Required to resume (AWS)

On EC2 (`/opt/vsp-phone-v4`) with deploy key:

```bash
npm run platform:ensure-inventory
npx prisma migrate deploy
npm run platform:rc1-infra
RC1_PROFILE=production npm run platform:rc1-env
API_BASE=https://api.vspphone.com/api \
PLATFORM_EMAIL=<admin> PLATFORM_PASSWORD=<password> \
npm run platform:pilot-smoke
# live PBX lab
CALL_LAB_RESULT=PASS npm run platform:rc1-validate
```

Or grant the agent: EC2 SSH **or** AWS `DATABASE_URL`/`REDIS_URL` (non-localhost) + platform smoke credentials.
