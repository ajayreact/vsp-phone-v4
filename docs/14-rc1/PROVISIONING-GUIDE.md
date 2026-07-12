# Platform Provisioning Guide (RC1)

| Field | Value |
|-------|-------|
| **Portal** | Platform Admin (`admin.<domain>`) |
| **Route** | `/provisioning` |
| **Permission** | `PLATFORM_TELNYX_WRITE` or `PLATFORM_SUPER_ADMIN` |

## Overview

The Enterprise Provisioning Wizard assigns DIDs, creates extensions, binds lines, and creates inbound routes in one operation via:

`POST /v1/carriers/telnyx/numbers/bulk/assign`

## Entry points

- Dashboard → Quick Actions → Provision
- Tenant Detail → Provision Tenant
- DID Inventory → select numbers → Provision
- Tenant Requests → approve flow → Provision

## Workflow

1. **Select tenant** — active tenant from platform list
2. **Select numbers** — available DIDs (status `available`, unassigned)
3. **Review** — confirm extension mapping (starting extension auto-computed)
4. **Execute** — live timeline shows assign → extensions → routes → validation
5. **Complete** — review succeeded/failed counts; retry failed numbers if needed

## Partial success

Bulk assign is sequential per number. If 4 of 5 succeed:

- Job status: `completed` with warnings
- Failed numbers listed with error messages (phone number, not UUID)
- **Retry Failed Numbers** retries only failed IDs

## Post-provision verification

1. Open Tenant Detail → Extensions, Phone Numbers, Devices tabs
2. Confirm counts match provision job
3. Run `scripts/platform/db-integrity-verification.sql` (optional)
4. Tenant portal: Extension Hub shows new extensions

## Client logging

Browser DevTools console:

```
[Provision] start { jobId, tenantId, numberCount, ... }
[Provision] finish { durationMs, succeeded, failed, retryCount }
```

## Known limitations

- Tenant notification step is skipped (no platform notify API)
- Extension cross-check requires `PLATFORM_SUPER_ADMIN` for full `/v1/extensions` list; assign response validated otherwise
- Bulk assign timeout: 120 seconds client-side

## Troubleshooting

| Symptom | Action |
|---------|--------|
| Permission denied | Confirm user has `PLATFORM_TELNYX_WRITE` |
| Number already assigned | Refresh DID Inventory; pick available numbers |
| Duplicate extension | Change starting extension; retry failed only |
| Timeout | Reduce batch size; check API/Telnyx latency |
