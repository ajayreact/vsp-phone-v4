# RC3 Performance Report

| Version | 4.0.0-rc3 |
| **Score** | **81/100** |

## Improvements (RC3)

| Area | Change |
|------|--------|
| Media plane | Real rtpengine removes control-only overhead pattern |
| Recording | Direct spool → S3 path without placeholder upload |
| Observability | Prometheus scrape enables latency/session trending |
| Prod compose | `restart: always` on all stateful services |

## Build Metrics

```
npx nx run api:build --skip-nx-cache
npx nx run admin:build --skip-nx-cache
```

## Runtime Expectations (production sizing guide)

| Component | 100 calls | 500 calls | 1000 calls |
|-----------|-----------|-----------|------------|
| rtpengine CPU | 1–2 vCPU | 4 vCPU | 8 vCPU |
| kamailio CPU | 1 vCPU | 2 vCPU | 4 vCPU |
| api CPU | 2 vCPU | 4 vCPU | 8 vCPU |
| postgres | 2 vCPU / 4GB | 4 vCPU / 8GB | 8 vCPU / 16GB |

## Recommendations

1. Enable Prometheus retention ≥ 15d for capacity planning
2. Index CDR and audit tables by `tenantId, createdAt`
3. Run load tier L2 before first paying customer
