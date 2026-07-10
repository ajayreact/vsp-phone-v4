# RC3 Load Test Matrix

Production load targets for VSP Phone v4 certification. Run on staging hardware matching production sizing.

## Prerequisites

- `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
- Real rtpengine-daemon (`cat /etc/rtpengine/.backend` → `real`)
- SIPp or equivalent load generator
- Prometheus + Grafana overlay for metrics during test

## Registration load

| Tier | Concurrent registrations | Duration | Pass criteria |
|------|-------------------------|----------|---------------|
| L1 | 100 | 10 min | 0 failed REGISTER; p95 < 500ms |
| L2 | 250 | 15 min | 0 failed REGISTER; p95 < 750ms |
| L3 | 500 | 20 min | < 0.1% failures; p95 < 1s |
| L4 | 1000 | 30 min | < 0.5% failures; no Kamailio OOM |

**Command template (SIPp):**

```bash
sipp -sf scripts/rc3/sipp-register.xml -i 10.0.0.10 -p 5062 \
  -m 1000 -l 1000 -r 20 -d 3600000 sip.localhost:5060
```

## Concurrent call load

| Tier | Concurrent calls | Codec | Pass criteria |
|------|------------------|-------|---------------|
| C1 | 100 | G.711 | MOS ≥ 3.5; packet loss < 1% |
| C2 | 250 | G.711 | MOS ≥ 3.2; CPU < 80% on rtpengine |
| C3 | 500 | G.711/Opus mix | No rtpengine session drops |
| C4 | 1000 | G.711 | Graceful degradation only; no crash |

## Metrics to capture

- Host CPU / memory (api, kamailio, rtpengine, postgres, redis)
- `vsp_rtpengine_sessions_total` from `/api/v1/telecom/metrics`
- PostgreSQL active connections
- Redis memory
- RTP UDP port utilization (10000–10099)
- SIP transaction latency (Kamailio xlog / CDR timestamps)

## MOS / quality

Use `rtpengine` stats or external RTP probe. Target MOS ≥ 3.5 for G.711 under C1–C2.

## Sign-off

Record results in `docs/13-production-validation/RC3_LOAD_TEST_REPORT.md`.
