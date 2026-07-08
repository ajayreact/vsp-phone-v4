# Performance Audit — VSP Phone v4

| Field | Value |
|-------|-------|
| **Document ID** | AUDIT-005 |
| **Date** | 2026-07-08 |
| **Scope** | Redis, async, events, blocking ops, pooling, memory |

---

## Performance rating: B (Acceptable for initial production; optimization opportunities identified)

---

## Redis usage

### Patterns

| Pattern | Usage | Assessment |
|---------|-------|------------|
| GET/SET with TTL | Correlation, idempotency, caches | ✅ Appropriate TTLs (30s–24h) |
| LPUSH + LTRIM | Audit, trace, batch index | ✅ Bounded lists |
| SCAN (limited) | Config export feature codes | ⚠️ N+1 GET per key (max 200 keys) |
| Soft-fail | All operations return safe defaults on error | ✅ Resilient; may mask degradation |
| PING | Health probes | ✅ Lightweight |

### Anti-patterns checked

| Pattern | Found? |
|---------|--------|
| `KEYS *` | ❌ Not found |
| `BLPOP`/`BRPOP` blocking | ❌ Not found |
| Unbounded list growth | ❌ Lists trimmed (audit 5000, batch index 500) |
| Large value storage | ⚠️ Full batch records JSON in Redis (migration/cutover) |

**Assessment:** Redis usage is disciplined. Config export scan is the main hot-path concern for admin operations (not call path).

---

## Connection pooling

| Resource | Configuration | Assessment |
|----------|---------------|------------|
| PostgreSQL | `DATABASE_POOL_MAX` default 10 per API instance | Standard; tune per instance count |
| PostgreSQL read replica | Separate pool in `PostgresHaService` | Probe-only overhead |
| Redis | Single shared ioredis client | Correct for ioredis; Sentinel/Cluster aware |
| HTTP (Kamailio) | 2s timeout in Kamailio http_client | Tight; may cause false routing failures under load |

**Recommendation:** Size `DATABASE_POOL_MAX × API instances` < Postgres `max_connections`.

---

## Async operations

| Operation | Pattern | Assessment |
|-----------|---------|------------|
| Audit append | `setImmediate` | Non-blocking; no backpressure |
| Trace append | `setImmediate` | Same |
| Structured logging | `setImmediate` in telecom logger | Same |
| Migration import | Sequential Redis writes | Acceptable for batch ops |
| Cutover readiness | `Promise.all` parallel probes | ✅ Efficient |

**Concern:** Fire-and-forget async with no queue depth monitoring. Under Redis latency spikes, unbounded `setImmediate` callbacks could accumulate memory pressure.

---

## Event handling

| Listener | Events | Hot-path impact |
|----------|--------|-----------------|
| `ObservabilityEventsListener` | 20+ domain events | Triggers metrics, trace, audit |
| `RegistrationEventsListener` | Registration events | Redis writes |
| `HaEventsListener` | Degradation/recovery | Logging only |
| `RecordingEventsListener` | Call answered/ended | Storage operations |

**Hot-path concern:** `ObservabilityEventsListener.onCallLifecycle` calls `void this.metrics.refreshGauges()` on call answered — triggers **Prisma `callSession.count()`** query synchronously initiated from event handler.

**Impact:** Low at moderate call volume; measurable under high CPS with multiple API instances all counting on every answer event.

---

## Blocking operations

| Operation | Blocking? | Context |
|-----------|-----------|---------|
| SIP digest auth | Prisma lookup + crypto | Per REGISTER — acceptable |
| Route resolve | Prisma multi-query + Redis | Per INVITE — critical path |
| Kamailio HTTP timeout | 2s max | Can block Kamailio worker |
| TLS cert file check | Sync `fs.existsSync` | Cutover readiness only |
| Prisma connect retry | Startup only | Acceptable |

**Critical path:** `RoutingService.resolve()` performs multiple Prisma queries per INVITE. Idempotency cache (30s) mitigates duplicate resolve for same callId.

---

## Memory usage

| Area | Concern |
|------|---------|
| In-process metrics registry | Bounded counters/gauges — low |
| In-memory dedupe (call trace) | Per-process; not shared across instances |
| EventEmitter listeners | Fixed set — low |
| Webpack bundle | Standard NestJS — no unusual memory patterns identified |
| Redis client buffer | ioredis default — monitor under large payloads |

**Assessment:** No obvious memory leak patterns. In-process trace dedupe means traces may duplicate across API instances (by design for stateless scaling).

---

## Kamailio ↔ API latency budget

```
INVITE → HTTP routing/resolve (2s timeout) → Prisma + Redis → JSON response → Kamailio fork/bridge
```

Total added post-dial delay includes:
- HTTP round-trip (API ↔ Kamailio Docker network)
- Prisma query latency (recorded in metrics histogram)
- Redis contact lookup

**Assessment:** Architecture is **control-plane HTTP** (not in-media-path) — acceptable for UCaaS. Tune pool sizes and indexes for INVITE resolve queries.

---

## Performance findings

| ID | Severity | Finding |
|----|----------|---------|
| PERF-01 | **Medium** | Prisma count on every call-answered for gauge refresh |
| PERF-02 | **Medium** | Config export SCAN + N+1 GET pattern |
| PERF-03 | **Medium** | Kamailio 2s HTTP timeout may cause false negatives under load |
| PERF-04 | **Low** | No backpressure on async audit/trace writes |
| PERF-05 | **Low** | Route resolve multi-query per INVITE — index-dependent |
| PERF-06 | **Low** | In-process metrics not cluster-coherent |

---

## Performance rating summary

| Area | Rating |
|------|--------|
| Redis efficiency | B+ |
| Connection pooling | B |
| Async/event patterns | B |
| Call-path latency | B |
| Memory profile | B+ |
| **Overall performance** | **B** |
