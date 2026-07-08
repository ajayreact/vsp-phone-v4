# Scalability Audit — VSP Phone v4

| Field | Value |
|-------|-------|
| **Document ID** | AUDIT-004 |
| **Date** | 2026-07-08 |
| **Scope** | Horizontal scaling, HA, stateless design |

---

## Scalability rating: B (API layer ready; signalling/media single-node biased)

---

## Stateless API services

| Criterion | Status | Evidence |
|-----------|--------|----------|
| No in-memory session state | ✅ | Call state in PostgreSQL + Redis |
| Correlation in Redis | ✅ | ADR-019 platformUuid maps |
| Idempotency keys | ✅ | Route idempotency in Redis (30s TTL) |
| Registration contacts | ✅ | Redis mirror + Kamailio usrloc |
| Horizontal API scaling | ✅ | Documented in `stateless-runtime.validation.ts` |
| Sticky sessions required | ❌ Not required | |

**Assessment:** NestJS API instances can scale horizontally behind a load balancer without session affinity.

---

## Redis

| Feature | Implementation | Path |
|---------|----------------|------|
| Connection modes | Standalone / Sentinel / Cluster | `redis-connection.factory.ts` |
| Soft-fail wrapper | Returns null/0 on errors | `telecom-redis.service.ts` |
| HA monitoring | Probe + degradation events | `redis-ha.service.ts` |
| Reconnect | Automatic via ioredis strategy | Factory config |

**Usage patterns:**
- Correlation maps (call, RTP, platform UUID)
- Registration contact bindings
- Rate limiting counters
- Audit/trace lists
- Migration/cutover staging
- Presence state
- Feature code registry

**Assessment:** Redis is the **primary ephemeral state store**. Sentinel/Cluster support is implemented at connection layer. All API instances share Redis — correct for horizontal scaling.

---

## PostgreSQL

| Feature | Implementation | Assessment |
|---------|----------------|------------|
| Connection pool | Prisma + `@prisma/adapter-pg`, `DATABASE_POOL_MAX` (default 10) | Adequate per instance |
| Connect retry | `prisma.service.ts` OnModuleInit retry | Resilient startup |
| Read replica | `postgres-ha.service.ts` — separate client via `DATABASE_READ_URL` | **Probe only — not used for read routing** |
| HA events | Degradation/recovery via EventEmitter | Monitoring only |

**Assessment:** Write path scales via connection pool per API instance. Read replica infrastructure exists but provides no read offload.

---

## Kamailio readiness

| Aspect | Status |
|--------|--------|
| Node registry | `kamailio-node-registry.service.ts` — `KAMAILIO_NODES`, TCP health, round-robin |
| Health probe (cutover) | Single host `KAMAILIO_HTTP_HOST:8880` |
| Kamailio usrloc | Memory-only (`db_mode=0`) — **state lost on restart** |
| Dispatcher | Static `dispatcher.list` for RTPengine + Telnyx |

**Gap:** Node registry used in HA/scalability reports but **not wired into health gates or Kamailio config generation**. Single Kamailio instance assumed in default deployment.

**Scaling path:** Kamailio can scale with shared usrloc DB (not configured) or DNS-based federation. Current config is single-node oriented.

---

## RTPengine readiness

| Aspect | Status |
|--------|--------|
| Node registry | `rtpengine-node-registry.service.ts` — `RTPENGINE_NODES` |
| Kamailio integration | Static `udp:rtpengine:2223` |
| Media port range | 10000–10099 (100 concurrent sessions per node) |
| HA failover | Registry monitors nodes; Kamailio does not auto-select |

**Gap:** Multi-node RTPengine registry exists in API but Kamailio uses fixed socket. Media scaling requires Kamailio dispatcher or rtpengine set_id configuration update.

---

## Horizontal scaling summary

| Component | Horizontally scalable? | Notes |
|-----------|------------------------|-------|
| NestJS API | ✅ Yes | Stateless; shared Redis + Postgres |
| Redis | ✅ Yes (Sentinel/Cluster) | Connection factory supports modes |
| PostgreSQL | ✅ Yes (external) | Read replica not routed |
| Kamailio | ⚠️ Single-node default | Registry exists; cfg not multi-node |
| RTPengine | ⚠️ Single-node default | Port range limits concurrent media |
| Telnyx | ✅ Carrier-side | Dispatcher primary/backup |

---

## Load balancing

- `load-balancer.middleware.ts` — request correlation, optional node hint headers
- `InFlightInterceptor` — graceful drain for rolling deploys
- `ShutdownCoordinatorService` — 30s default drain window

**Assessment:** ✅ API rolling deployment pattern is sound.

---

## Event-driven architecture

- Global `EventEmitterModule` (ADR-014)
- Domain events: call, registration, carrier, queue, IVR, conference, recording, presence
- HA degradation events with recovery handlers

Synchronous event handlers delegate heavy work via `setImmediate` (audit, trace). Metrics gauge refresh triggers Prisma query on call-answered (see Performance audit).

---

## Scalability findings

| ID | Severity | Finding |
|----|----------|---------|
| SCL-01 | **High** | Kamailio usrloc memory-only — restart drops registrations |
| SCL-02 | **Medium** | RTPengine/Kamailio node registries not connected to signalling config |
| SCL-03 | **Medium** | Read replica probed but unused for query offload |
| SCL-04 | **Medium** | RTPengine media port range (100 ports) limits concurrent calls per node |
| SCL-05 | **Low** | `READINESS_STRICT` in HA health is a no-op stub |
| SCL-06 | **Low** | In-process Prometheus metrics — per-instance, not cluster-aggregated |

---

## Scalability rating summary

| Area | Rating |
|------|--------|
| API horizontal scaling | A- |
| Redis HA | B+ |
| PostgreSQL HA | B- |
| Kamailio scaling | C+ |
| RTPengine scaling | C+ |
| Rolling deployment | A- |
| **Overall scalability** | **B** |
