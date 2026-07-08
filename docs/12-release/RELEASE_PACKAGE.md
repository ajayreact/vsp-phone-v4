# Release Package — VSP Phone v4.0.0-rc1

| Version | 4.0.0-rc1 |
|---------|-----------|

Complete inventory of the RC1 release package for staging deployment.

---

## Application binaries

| Component | Build command | Output |
|-----------|---------------|--------|
| NestJS API | `npx nx build api` | Webpack bundle (production) |
| Next.js Admin | `npx nx build admin` | `.next/standalone` production server |
| Shared libraries | `nx build config/logger/common` | `dist/packages/*` |

---

## Container images

| Service | Dockerfile | Targets |
|---------|------------|---------|
| API | `infrastructure/docker/Dockerfile.api` | development, production |
| Admin | `infrastructure/docker/Dockerfile.admin` | development, production |
| Kamailio | `infrastructure/docker/Dockerfile.kamailio` | single |
| RTPengine | `infrastructure/docker/Dockerfile.rtpengine` | single |

Build:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```

---

## Configuration package

| File | Purpose |
|------|---------|
| `.env.example` | Environment template (all RC1 vars) |
| `docker-compose.yml` | Full stack definition |
| `docker-compose.prod.yml` | Production overlay |
| `infrastructure/kamailio/kamailio.cfg` | SIP routing (frozen) |
| `infrastructure/kamailio/dispatcher.list` | Carrier/RTPengine targets |
| `infrastructure/kamailio/permissions.address` | SIP permissions |
| `infrastructure/kamailio/usrloc-schema.sql` | Postgres usrloc tables |
| `infrastructure/rtpengine/rtpengine.conf` | Media config (frozen) |
| `infrastructure/docker/kamailio/docker-entrypoint.sh` | Auth + usrloc injection |

---

## Scripts and validators

| Script | Purpose |
|--------|---------|
| `npm run build` | Full monorepo production build |
| `npm run telecom:validate:remediation` | RC1 quality gate |
| `npm run telecom:validate:phase20` | Cutover regression |
| `npm run telecom:openapi` | Export OpenAPI |
| `npm run tls:validate` | Certificate validation |
| `scripts/telecom/validate-remediation.cjs` | Static remediation checks |

---

## Documentation package

| Document | Path |
|----------|------|
| Release notes | `docs/12-release/RELEASE_NOTES_v4.0.0_RC1.md` |
| RC1 checklist | `docs/12-release/RC1_CHECKLIST.md` |
| API guide | `docs/05-api/README.md` |
| Security guide | `docs/06-security/README.md` |
| Deployment guide | `docs/07-deployment/README.md` |
| Testing strategy | `docs/08-testing/README.md` |
| Troubleshooting | `docs/10-production/TROUBLESHOOTING.md` |
| Production runbooks | `docs/10-production/*` |
| Audit & remediation | `docs/11-final-audit/*` |
| Telecom architecture | `docs/04-telecom/*` |
| ADRs | `docs/ADR/*` |

---

## Migration toolkit (included)

- Validation, dry-run, Redis import APIs
- Optional production import (tenant/queue)
- Super Admin authentication
- Rollback metadata (non-destructive)

---

## Production platform (included)

- Deployment readiness gates
- Backup orchestration hooks
- Restore validation
- Cutover smoke tests (16 probes)
- Config export (secrets excluded)

---

## Deployment prerequisites

1. PostgreSQL 16+, Redis 7+ with persistence
2. TLS certificates for API, SIP, WSS, provisioning
3. Production secrets in sealed vault
4. `npx prisma generate` after install
5. Git tag `v4.0.0-rc1` (see [RELEASE_MANIFEST.md](./RELEASE_MANIFEST.md))

---

## Related documents

- [RELEASE_MANIFEST.md](./RELEASE_MANIFEST.md)
- [FINAL_RC1_REPORT.md](./FINAL_RC1_REPORT.md)
