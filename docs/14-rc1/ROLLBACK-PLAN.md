# RC1 Rollback Plan

| Field | Value |
|-------|-------|
| **Version** | v4.0.0-rc1 |
| **Trigger** | P1 outage, failed smoke tests, data integrity failure |

## Decision criteria

Initiate rollback when any of:

- API health/ready endpoints fail for > 5 minutes
- SIP registration or PSTN call path broken for pilot tenant
- Provisioning creates orphan records (integrity SQL returns issues)
- Unrecoverable auth/RBAC regression

## Rollback steps

### 1. Stop traffic (T+0)

1. Notify NOC and stakeholders
2. If carrier cutover occurred, revert DID routing in Telnyx console to previous platform
3. Enable maintenance page on admin/tenant hostnames (if available)

### 2. Revert application (T+5m)

```bash
# Restore previous image tag
docker compose pull   # previous tag
docker compose up -d api admin kamailio rtpengine
```

Or redeploy previous git tag:

```bash
git checkout <previous-tag>
docker compose build api admin
docker compose up -d api admin
```

### 3. Database (T+10m)

RC1 has **no schema changes**. Rollback is application-only unless a bad migration was applied.

If data corruption occurred:

1. Stop API writes
2. Restore PostgreSQL from last pre-deploy backup
3. Run `scripts/platform/db-integrity-verification.sql`
4. Confirm zero critical integrity issues

### 4. Verify previous version (T+20m)

```bash
curl -s https://<api-host>/api/health
curl -s https://<api-host>/api/ready
```

Manual: platform login, tenant login, test extension call.

### 5. Post-mortem (T+24h)

- Document root cause in incident tracker
- Update [KNOWN-ISSUES.md](./KNOWN-ISSUES.md)
- Block re-release until blockers cleared

## API rollback reference

When stack supports cutover API:

- `GET /api/v1/cutover/rollback-plan`
- See `docs/10-production/rollback-runbook.md`

## Recovery after partial provisioning

If provisioning partially succeeded before rollback:

1. Run `scripts/platform/db-integrity-verification.sql`
2. Manually release or reassign affected DIDs via platform admin
3. Do not re-run bulk assign until integrity is clean
