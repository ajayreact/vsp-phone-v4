# Docker images (Phase 1)

| Dockerfile | Service | Targets |
|------------|---------|---------|
| `Dockerfile.api` | NestJS API | `development`, `production` |
| `Dockerfile.admin` | Next.js admin | `development`, `production` |
| `Dockerfile.kamailio` | Kamailio SIP | single |
| `Dockerfile.rtpengine` | RTPengine (or Phase-1 stub) | single |

Build context is always the **repository root**.

```bash
docker compose build api admin kamailio rtpengine
```
