# RC1 — Operational Readiness

| Field | Value |
|-------|-------|
| Generated | 2026-07-17 |
| Docs present | **PASS** |
| Live ops verified on this host | **NO** (no Docker; Postgres auth mismatch; Redis down) |

## Checklist

| Item | Status | Reference |
|------|--------|-----------|
| Automated backups documented | DOC OK | AWS checklist § backups; `BACKUP_LOCATION` |
| Restore procedure | DOC OK | [ROLLBACK.md](./ROLLBACK.md) |
| Log rotation | DOC OK | AWS / compose logging guidance |
| Health checks | DOC OK | `/api/health`, `/api/ready`, component health |
| Monitoring | DOC OK | optional Prometheus/Grafana overlay |
| Alerting | PARTIAL | define alerts on staging (5xx, auth, SIP) |
| Audit logs | CODE OK | enterprise audit + PBX mutation audits |
| Disaster recovery | DOC OK | ROLLBACK + AWS checklist |
| Rollback procedure | DOC OK | [ROLLBACK.md](./ROLLBACK.md) |
| Preprod cleanup | DOC OK | [PREPROD-CLEANUP.md](./PREPROD-CLEANUP.md) |
| Feature freeze | ACTIVE | [FEATURE-FREEZE.md](./FEATURE-FREEZE.md) |

## Production deployment checklist (minimum)

1. [ ] Fix env FAIL items (`TELNYX_API_KEY`, `CORS_ORIGINS`; disable `MIGRATION_DEV_SUPER_ADMIN` in prod)
2. [ ] `npx prisma migrate deploy` (Global Inventory — no inventory tenant)
3. [ ] `npx prisma migrate deploy` + `npm run platform:rc1-infra`
4. [ ] Redis + Postgres healthy (`/api/ready`)
5. [ ] Pre-deploy `pg_dump` + verify backup restore once
6. [ ] Deploy API + admin; smoke portal login matrix
7. [ ] `npm run platform:pilot-smoke` green
8. [ ] Call lab checklist signed
9. [ ] Monitoring dashboards + pager alerts enabled

## Rollback checklist

1. [ ] Confirm trigger (health >5m / auth / SIP / integrity fail)
2. [ ] Prefer app rollback to prior git SHA
3. [ ] DB restore only if migration/data corruption
4. [ ] Verify `/api/health`, `/api/ready`, portal login, one test call

## Monitoring checklist

| Signal | Alert |
|--------|-------|
| API 5xx rate | Page on sustained spike |
| `/api/ready` down | Page immediately |
| Login 401/403 spike | Investigate auth/config |
| Kamailio REGISTER fail rate | Telecom on-call |
| Telnyx assign/purchase errors | Carrier ops |
| Redis unavailable | Page (sessions / MAC index) |
| Disk for recordings / backups | Warn at 80% |
