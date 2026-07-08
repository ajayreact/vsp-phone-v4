# Infrastructure

Docker, Kamailio, RTPengine, and related ops assets for VSP Phone v4.

## Phase 1 layout

```text
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
    README.md
  kamailio/
    kamailio.cfg          # Phase 1 bootstrap (OPTIONS only)
  rtpengine/
    rtpengine.conf        # Phase 1 lab config
  nginx/                  # Phase 2+
  kubernetes/           # Phase 2+
  monitoring/             # Phase 20+
```

## Compose entrypoints (repo root)

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local full stack |
| `docker-compose.prod.yml` | Production build-target overlay |
| `.env.example` | Shared env inventory |
| `Makefile` / `scripts/dev.ps1` | Task runners |

See [Phase 1 completion report](../docs/09-implementation/phase-1-infrastructure-completion.md).
