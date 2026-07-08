# Phase 1 — Infrastructure & Development Environment (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P1-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 1 Complete (local validation partial — Docker CLI absent on build host) |
| **Date** | 2026-07-08 |
| **Blueprint** | [IMP-S5-001](./sprint-5-engineering-blueprint.md) Phase 1 |
| **Wave** | Sprint 5 — Wave 1 |

---

## 1. Infrastructure summary

Phase 1 delivers a reproducible multi-container foundation for VSP Phone v4 without redesigning frozen architecture or regenerating Prisma.

| Capability | Implementation |
|------------|----------------|
| Compose stack | `docker-compose.yml` — postgres, redis, api, admin, kamailio, rtpengine |
| Prod overlay | `docker-compose.prod.yml` (production build targets) |
| Optional OSS | MinIO via `--profile extras` |
| Network | Bridge `vsp_internal` |
| Volumes | Named persistent volumes for PG, Redis, Kamailio logs, RTP spool, MinIO |
| Health | Compose healthchecks on all core services; NestJS `/api/health` + `/api/ready`; Admin `/api/health` |
| Config | `.env.example`, env validation in NestJS `validateEnv` |
| Task runners | `Makefile`, `scripts/dev.ps1`, npm `docker:*` scripts |
| Telecom bootstrap | Minimal Kamailio cfg (OPTIONS); RTPengine conf + install-or-stub for Desktop labs |

**Architecture freeze held:** no Prisma schema redesign; no Kamailio/RTPengine production dialplan; no Sprint 4.x TEL-* changes.

---

## 2. Folder structure

```text
e:\vsp-phone-v4\
  docker-compose.yml
  docker-compose.prod.yml
  .env.example
  .dockerignore
  Makefile
  scripts/dev.ps1
  apps/
    api/src/app/
      app.module.ts
      env.validation.ts
      health.controller.ts
    admin/src/app/api/health/route.ts
  infrastructure/
    docker/
      Dockerfile.api
      Dockerfile.admin
      Dockerfile.kamailio
      Dockerfile.rtpengine
      kamailio/docker-entrypoint.sh
      rtpengine/install-or-stub.sh
      rtpengine/docker-entrypoint.sh
      postgres/init/00-init.sql
    kamailio/kamailio.cfg
    rtpengine/rtpengine.conf
  docs/09-implementation/
    phase-1-infrastructure-completion.md   ← this file
```

---

## 3. Docker service diagram

```text
                    ┌─────────────────────────────────────┐
                    │           vsp_internal               │
  Host              │                                     │
  :5432 ────────────► postgres (health: pg_isready)       │
  :6379 ────────────► redis (health: PING, AOF)           │
  :3000 ────────────► api ──depends_on──► pg + redis      │
  :3001 ────────────► admin ──depends_on──► api healthy   │
  :5060 ────────────► kamailio ──depends_on──► redis+rtp  │
  :2223/:10000-99 ──► rtpengine                           │
  :9000/:9001 ──────► minio (profile: extras)             │
                    └─────────────────────────────────────┘
```

**Startup order (Compose conditions):**

1. `postgres`, `redis` become healthy  
2. `rtpengine` starts (cap NET_ADMIN)  
3. `api` starts after pg+redis healthy  
4. `kamailio` starts after redis healthy + rtpengine started  
5. `admin` starts after api healthy  

---

## 4. Environment variable inventory

| Variable | Default | Used by |
|----------|---------|---------|
| `NODE_ENV` / `VSP_ENV` | development | All apps / Compose labels |
| `LOG_LEVEL` / `LOG_FORMAT` | info / json | API structured logs |
| `PORT` / `API_PORT` / `API_GLOBAL_PREFIX` | 3000 / api | NestJS |
| `ADMIN_PORT` / `ADMIN_HOST_PORT` | 3001 | Next.js |
| `NEXT_PUBLIC_API_URL` | http://localhost:3000/api | Admin |
| `API_DOCKER_TARGET` / `ADMIN_DOCKER_TARGET` | development | Compose build target |
| `POSTGRES_*` / `DATABASE_URL` | see `.env.example` | PG + API |
| `REDIS_*` / `REDIS_URL` | see `.env.example` | Redis + API |
| `KAMAILIO_SIP_PORT` | 5060 | Kamailio publish |
| `RTPENGINE_*` | 2223 / 10000-10099 | RTPengine publish |
| `MINIO_*` / `S3_*` | extras profile | Object storage |
| `DEV_JWT_SECRET` / `DEV_TELECOM_HMAC_SECRET` | dev placeholders | Local secrets only |

Inside Compose, `DATABASE_URL` / `REDIS_URL` are overridden to hostnames `postgres` / `redis`.

---

## 5. Startup instructions

```bash
cp .env.example .env
npm install
npm run docker:validate   # requires Docker CLI
npm run docker:up         # full stack
# Windows: .\scripts\dev.ps1 up
# Health:  make health  OR  .\scripts\dev.ps1 health
```

Host-only apps (data containers or external PG/Redis):

```bash
npm run docker:core       # when Docker available
npm run serve:api
npm run dev:admin
```

Production-style targets:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## 6. Validation results

| Check | Result | Evidence |
|-------|--------|----------|
| NestJS build (`nx build api`) | **PASS** | webpack compiled successfully |
| NestJS `/api/health` | **PASS** | `{"status":"ok","service":"api"}` |
| NestJS `/api/ready` | **PASS logic** | Returns 503 degraded when Redis down; Postgres check **up** on this host |
| Next.js build (`nx build admin`) | **PASS** | `/api/health` route generated |
| Next.js `/api/health` | **PASS** | `{"status":"ok","service":"admin"}` |
| Env validation | **PASS** | API boots with required `DATABASE_URL` / `REDIS_URL` |
| Compose file present + services defined | **PASS** | All Phase 1 services wired |
| `docker compose up` full stack | **BLOCKED on this host** | Docker Desktop / `docker` CLI **not installed** |
| PostgreSQL container healthy | **NOT RUN** (no Docker) | Host port 5432 already open (external/local PG) |
| Redis container healthy | **NOT RUN** | Host 6379 closed during smoke |
| Kamailio / RTPengine containers | **NOT RUN** | Require Docker |

**Interpretation:** Application health endpoints and builds are verified. Full multi-container validation must be executed once Docker is available (`make up && make health`).

---

## 7. Known issues

1. **Docker not installed on the implementation host** — cannot finalize Compose bring-up here.  
2. **RTPengine apt may fall back to Phase-1 process stub** on Docker Desktop (documented in `infrastructure/rtpengine/README.md`); real media is Phase 6.  
3. **Kamailio Phase 1 cfg** answers OPTIONS only; REGISTER/INVITE are intentionally `503`.  
4. **MinIO image healthcheck** uses `curl` — ensure image includes curl or swap to wget on first CI run if needed.  
5. **Nx reset EPERM** observed on Windows locking `.nx/workspace-data` — cosmetic during smoke; not a Phase 1 deliverable defect.  
6. **Admin `project.json`:** avoided `${PORT:-3001}` shell syntax (breaks on Windows cmd); fixed ports `3001`.  
7. Track **B1** from Wave 0 (`CallSession.sipCallId`) remains Phase 4 — not in Phase 1 scope.

---

## 8. Phase 1 completion checklist

- [x] Local development environment docs / README  
- [x] Docker Compose foundation  
- [x] Network topology (`vsp_internal`)  
- [x] PostgreSQL service + volume + healthcheck  
- [x] Redis service + AOF volume + healthcheck  
- [x] Kamailio container + bootstrap cfg + healthcheck  
- [x] RTPengine container + conf + healthcheck (stub-capable)  
- [x] NestJS API Dockerfile + health/ready endpoints + env validation  
- [x] Next.js Admin Dockerfile + `/api/health`  
- [x] Shared `.env.example` + profile separation (`VSP_ENV`, prod overlay)  
- [x] Dev secrets placeholders (non-prod)  
- [x] Container `depends_on` startup order  
- [x] Structured JSON logging defaults  
- [x] Volume layout  
- [x] Makefile + PowerShell task runner  
- [x] Host validation: API + Admin health  
- [ ] Engineer workstation: `docker compose up` green (blocked here — run on Docker host)

### Exit decision

**Phase 1 implementation artifacts are complete.** Formal Compose cluster validation is the only remaining host-environment dependency. Wave 1 may proceed to **Phase 2 (Certificates & TLS)** on a Docker-capable workstation after `make up && make health` succeeds; do not start Phase 2 coding on this machine until Docker validation is recorded.

---

## Related

| Doc | Role |
|-----|------|
| [IMP-S5-001](./sprint-5-engineering-blueprint.md) | Blueprint |
| [IMP-S5-W0-001](./wave-0-adr-gate-readiness-review.md) | Wave 0 gate |
| ADR-015 | Deployment architecture |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-08 | Phase 1 infrastructure implemented and host-validated (sans Docker daemon) |
