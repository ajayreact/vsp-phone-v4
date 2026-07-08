# Rollback Runbook — VSP Phone v4

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Phase** | 20 |

---

## Purpose

This runbook describes the procedure for rolling back to the legacy VSP VoIP platform if production cutover fails. **The toolkit does not perform automatic rollback** — this is a manual operational procedure.

---

## Rollback decision criteria

Initiate rollback when any of the following occur:

- Critical smoke test failures that cannot be resolved within the cutover window
- Widespread call failures (> 10% of test calls fail)
- SIP registration failures across multiple tenants
- Data integrity issues discovered in migration verification
- Incident commander declares rollback

---

## Rollback plan generation

Before cutover, generate and review the rollback plan:

```bash
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/cutover/rollback-plan?batchId={batchId}"
```

The plan includes:

- Affected components
- Migration batch references
- Verification requirements
- Estimated rollback duration

---

## Rollback procedure

### 1. Declare rollback (T+0)

1. Incident commander authorizes rollback
2. Notify NOC, stakeholders, and support teams
3. Set cutover state to `rollback_planned`

### 2. Traffic restoration (T+5m)

1. Revert DID routing to legacy platform in Telnyx console
2. Confirm legacy Kamailio/SBC accepting registrations
3. Verify legacy platform health endpoints

### 3. Data considerations (T+15m)

1. Document migration batch IDs from rollback plan
2. **Do not** automatically delete VSP Phone v4 data
3. Redis migration staging remains for forensic analysis
4. PostgreSQL data requires manual restore if written (Phase 19 staging only)

### 4. Verification (T+30m)

1. Run smoke tests on legacy platform
2. Confirm inbound/outbound calls on legacy
3. Verify customer-facing services restored

### 5. Post-rollback (T+1h)

1. Complete rollback checklist items
2. Schedule post-mortem
3. Export cutover report for incident record

---

## Rollback checklist

| ID | Item | Owner | Status |
|----|------|-------|--------|
| RB-01 | Rollback decision declared | Incident Commander | ☐ |
| RB-02 | Legacy traffic routing restored | Telecom Ops | ☐ |
| RB-03 | DID routing reverted | Telecom Ops | ☐ |
| RB-04 | Customer notification sent | Support | ☐ |
| RB-05 | Migration batch IDs captured | Migration Lead | ☐ |
| RB-06 | Legacy platform smoke test passed | QA / NOC | ☐ |
| RB-07 | Post-mortem scheduled | Project Manager | ☐ |

---

## Related documents

- [Production Runbook](./production-runbook.md)
- [NOC Operations Guide](./noc-operations-guide.md)
