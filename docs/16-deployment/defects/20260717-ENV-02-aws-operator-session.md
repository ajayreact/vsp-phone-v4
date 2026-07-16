# ENV-02 — Operator Access Limitation (not an application defect)

| Field | Value |
|-------|-------|
| Date | 2026-07-17 |
| ID | ENV-02 |
| Severity | N/A — **operator access**, not app/P0 product defect |
| Status | **Acknowledged** — agent standing by |
| Application code change | **None** |
| Database migration | **None** |
| Environment file change by agent | **None** |

## Statement

ENV-02 records that the Cursor agent host cannot execute RC1 commands on AWS (no SSH key / no AWS DB session in-agent). The AWS deployment itself was **verified by the operator**.

This does **not** block Customer Pilot as a software defect. Certification continues when the operator runs the RC1 sequence **on the EC2 host** and provides command output for analysis.

## Operator sequence (AWS EC2 only)

```bash
cd /opt/vsp-phone-v4
source scripts/platform/ec2-compose-env.sh   # if used on this host

npm run platform:ensure-inventory
npx prisma migrate deploy
npm run platform:rc1-infra
RC1_PROFILE=production npm run platform:rc1-env
API_BASE=https://api.vspphone.com/api \
PLATFORM_EMAIL=<admin> PLATFORM_PASSWORD=<password> \
npm run platform:pilot-smoke
# live PBX call laboratory
CALL_LAB_RESULT=PASS npm run platform:rc1-validate
```

Paste each command’s output into chat for classification. On failure: stop → new ENV defect → fix → rerun that command → continue.
