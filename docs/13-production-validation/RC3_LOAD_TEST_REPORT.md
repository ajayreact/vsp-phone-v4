# RC3 Load Test Report

| Version | 4.0.0-rc3 |
| **Status** | Template — execute on staging hardware |

## Summary

Load test matrix defined in `scripts/rc3/LOAD_TEST_MATRIX.md`. Execution requires SIPp or equivalent on infrastructure matching production sizing.

## Targets

| Tier | Registrations | Concurrent calls | Target |
|------|---------------|-------------------|--------|
| L1 / C1 | 100 | 100 | Pilot |
| L2 / C2 | 250 | 250 | Early production |
| L3 / C3 | 500 | 500 | Growth |
| L4 / C4 | 1000 | 1000 | Enterprise peak |

## Results (fill on execution)

| Test | Date | Pass | CPU peak | Memory peak | p95 latency | MOS | Notes |
|------|------|------|----------|-------------|-------------|-----|-------|
| L1 registrations | | | | | | | |
| C1 calls | | | | | | | |
| L4 registrations | | | | | | | |
| C4 calls | | | | | | | |

## Tooling

- Prometheus/Grafana overlay for metrics during test
- Host `top` / `docker stats` for container resources
- `tcpdump` on RTP range for packet loss estimate

## Pass Criteria

- Zero crash/restart during tier duration
- Registration failure rate within tier threshold
- MOS ≥ 3.2 at C2 minimum for G.711
