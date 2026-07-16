# Defect — ENV-01 (CLOSED for AWS)

| Field | Value |
|-------|-------|
| Date opened | 2026-07-17 |
| Date closed | 2026-07-17 |
| ID | **ENV-01** |
| Severity | P0 (Critical) — **closed** |
| Status | **CLOSED** |
| Scope | Local Windows PostgreSQL only — **discarded from RC certification** |
| AWS PostgreSQL | **Verified by operator** — not this defect |

## Closure statement

ENV-01 described authentication failure against **local Windows PostgreSQL 18** (`localhost:5432`). That environment is **not** the RC1 deployment target.

Operator verified on **AWS EC2 staging**:

- PostgreSQL container running  
- Role `vsp` exists  
- Database `vsp_phone_v4` accessible  
- Platform tenant exists  
- VSP INTERNAL tenant exists  
- Pre-production cleanup completed  
- Active devices = 0  

**ENV-01 must not block AWS RC1 certification.** Do not reopen unless AWS PostgreSQL itself fails authentication.

## Historical note (local only — not certification evidence)

Local workstation `.env` pointed at `localhost` and received `28P01`. That finding is archived for local developer setup only and is **out of scope** for Customer Pilot gates.
