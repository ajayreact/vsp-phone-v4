# RC1 — Infrastructure Validation Report (AWS target)

| Field | Value |
|-------|-------|
| Generated | 2026-07-17 |
| Target | **AWS EC2 staging** |
| Result | **NOT COMPLETED** — stopped before AWS execution |
| Defect | [ENV-02](./defects/20260717-ENV-02-aws-operator-session.md) (P0) |
| ENV-01 | **CLOSED** — localhost discarded; not certification evidence |

## Operator-verified on AWS (accepted)

| Check | Status |
|-------|--------|
| PostgreSQL container running | PASS (operator) |
| Role `vsp` exists | PASS (operator) |
| Database `vsp_phone_v4` accessible | PASS (operator) |
| Platform tenant exists | PASS (operator) |
| VSP INTERNAL tenant exists | PASS (operator) |
| Pre-production cleanup | PASS (operator) |
| Active devices = 0 | PASS (operator) |

## Agent-executed this pass

| Step | Command | Status | Detail |
|------|---------|--------|--------|
| Preflight | AWS API `/api/health` + `/api/ready` | **PASS** | `https://api.vspphone.com/api` → 200 |
| SSH to EC2 | `ubuntu@32.196.41.160` | **FAIL** | Permission denied (publickey) |
| 1 | `npm run platform:ensure-inventory` | **NOT RUN** | Would use localhost `DATABASE_URL` — forbidden |
| 2 | `npx prisma migrate deploy` | **NOT RUN** | Same |
| 3 | `npm run platform:rc1-infra` | **NOT RUN** | Same |

## Next

Provide EC2 SSH access (or AWS DB URL + credentials) and restart from step 1 **on AWS**.
