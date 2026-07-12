# Docker images (Phase 1)

| Dockerfile | Service | Targets |
|------------|---------|---------|
| `Dockerfile.api` | NestJS API | `development`, `production` |
| `Dockerfile.admin` | Next.js admin | `development`, `production` |
| `Dockerfile.kamailio` | Kamailio SIP | single |
| `Dockerfile.rtpengine` | RTPengine (or Phase-1 stub) | single |

Build context is always the **repository root**.

Environment files:

| File | Use |
|------|-----|
| `.env.production.template` | Required production API/admin variables |
| `.env.optional.template` | Optional API tuning |
| `.env.example` | Local development |

The API container loads secrets via `env_file: [.env]`. Production overlay (`docker-compose.prod.yml`) explicitly passthroughs `JWT_SECRET`, `TELECOM_SERVICE_AUTH_TOKEN`, `TELNYX_*`, and `CORS_ORIGINS`. `DATABASE_URL` and `REDIS_URL` are overridden by Compose service networking.

Admin production build requires `NEXT_PUBLIC_API_URL` as a Docker **build ARG** (see `Dockerfile.admin`).

See [docs/07-deployment/ENVIRONMENT.md](../../docs/07-deployment/ENVIRONMENT.md).

```bash
docker compose build api admin kamailio rtpengine
```
