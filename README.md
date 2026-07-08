# VSP Phone v4

Carrier-grade, multi-tenant cloud phone platform monorepo.

## Stack

- **Monorepo:** Nx
- **API:** NestJS (`apps/api`)
- **Admin:** Next.js (`apps/admin`)
- **Shared libraries:** `@vsp/common`, `@vsp/config`, `@vsp/logger`
- **Data:** PostgreSQL, Prisma, Redis
- **Telecom:** Kamailio, RTPengine (Compose bootstrap in Phase 1)
- **Object storage (optional):** MinIO (`--profile extras`)

## Prerequisites

- Node.js 20+
- Docker Desktop / Docker Engine with Compose v2

## Quick Start (Phase 1 infrastructure)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Validate and start the full stack
npm run docker:validate
npm run docker:up

# Windows without Make:
#   .\scripts\dev.ps1 up

# 4. Health checks
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
curl http://localhost:3001/api/health

# Or: make health   /   .\scripts\dev.ps1 health
```

### Core data plane only

```bash
npm run docker:core
```

### With MinIO

```bash
docker compose --env-file .env --profile extras up -d --build
```

## Local apps without containers

```bash
npm run docker:core          # Postgres + Redis
npm run serve:api            # http://localhost:3000/api
npm run dev:admin            # http://localhost:3001
```

## Project Structure

```text
apps/
  api/                 NestJS API
  admin/               Next.js admin
packages/
  common|config|logger Shared libraries
prisma/                Frozen Prisma schema (no regenerate in Phase 1)
infrastructure/
  docker/              Dockerfiles + entrypoints
  kamailio/            Phase 1 SIP bootstrap cfg
  rtpengine/           Phase 1 media cfg
docs/                  Architecture + Sprint 5 playbooks
```

## Documentation

- Architecture: [docs/](docs/)
- Sprint 5 blueprint: [docs/09-implementation/sprint-5-engineering-blueprint.md](docs/09-implementation/sprint-5-engineering-blueprint.md)
- Phase 1 completion: [docs/09-implementation/phase-1-infrastructure-completion.md](docs/09-implementation/phase-1-infrastructure-completion.md)
