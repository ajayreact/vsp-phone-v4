# VSP Phone 5 — Performance Report (Pilot Load Probe)

| Field | Value |
|-------|-------|
| Generated | 2026-07-17 |
| Result | **NOT EXECUTED** (local environment) |
| Reason | No staging API credentials; local DB auth failed |

## How to run

```bash
API_BASE=https://api.staging.example/api \
PLATFORM_EMAIL=... PLATFORM_PASSWORD=... \
LOAD_TENANT_TIERS=100,500,1000 \
LOAD_EXTENSIONS=10000 \
npm run platform:pilot-load
```

## Targets

| Tier | Focus |
|------|-------|
| 100 tenants | Concurrent tenant list / dashboard p95 |
| 500 tenants | Same; note concurrency cap without seed |
| 1,000 tenants | Requires seeded staging DB |
| 10,000 extensions | Extension + user search p95; `LOAD_SEED=1` on isolated DB |

## Related

- SIPp / call load: `docs/13-production-validation/RC3_LOAD_TEST_REPORT.md`
- Script: `scripts/platform/pilot-load-test.cjs`

Fill metric tables after staging execution. Baseline pass criterion in script: dashboard p95 &lt; 3000ms and zero probe errors.
