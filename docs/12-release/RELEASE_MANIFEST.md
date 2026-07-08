# Release Manifest — VSP Phone v4.0.0-rc1

| Field | Value |
|-------|-------|
| **Release** | v4.0.0-rc1 |
| **Release date** | 2026-07-09 |
| **Release owner** | VSP Platform Engineering |
| **Build timestamp** | 2026-07-09 (RC1 finalization sprint) |
| **Git commit** | *Not available — repository not under git* |
| **Git tag** | *Not applied — see commands below* |
| **Branch** | *Not applicable* |

---

## Version alignment (B-02)

| Artifact | Version |
|----------|---------|
| Root `package.json` | `4.0.0-rc1` |
| `packages/config/package.json` | `4.0.0-rc1` |
| `packages/logger/package.json` | `4.0.0-rc1` |
| `packages/common/package.json` | `4.0.0-rc1` |
| `apps/api/package.json` | `4.0.0-rc1` |
| `apps/admin/package.json` | `4.0.0-rc1` |
| API runtime (`GET /api/v1/production/version`) | Reads root `package.json` → `4.0.0-rc1` |
| Health mode | `remediation-complete` |
| Release phase metadata | `remediation-complete` |

---

## Git release commands (B-03)

Git is **not initialized** in the RC1 audit environment. Execute on the release host:

```bash
git init
git add .
git commit -m "Release Candidate 1"
git tag v4.0.0-rc1
```

Record the resulting commit hash:

```bash
git rev-parse HEAD
```

Set at deploy time:

```env
BUILD_GIT_COMMIT=<sha from git rev-parse HEAD>
BUILD_TIMESTAMP=<ISO-8601 timestamp>
RELEASE_NUMBER=4.0.0-rc1
```

**Do not fabricate commit hashes.**

---

## Release artifacts

| Category | Location |
|----------|----------|
| API Docker image | `infrastructure/docker/Dockerfile.api` |
| Admin Docker image | `infrastructure/docker/Dockerfile.admin` |
| Kamailio image | `infrastructure/docker/Dockerfile.kamailio` |
| RTPengine image | `infrastructure/docker/Dockerfile.rtpengine` |
| Environment template | `.env.example` |
| Compose (dev) | `docker-compose.yml` |
| Compose (prod overlay) | `docker-compose.prod.yml` |
| Kamailio config | `infrastructure/kamailio/kamailio.cfg` |
| RTPengine config | `infrastructure/rtpengine/rtpengine.conf` |
| Usrloc schema | `infrastructure/kamailio/usrloc-schema.sql` |
| OpenAPI export | `docs/09-implementation/openapi-telecom-phase5.json` |
| Release notes | `docs/12-release/RELEASE_NOTES_v4.0.0_RC1.md` |

---

## Validation commands (required before staging)

```bash
npx prisma generate
npm run build
npm run telecom:validate:remediation
```

---

## Engineering freeze confirmation

| Constraint | Status |
|------------|--------|
| Prisma schema | Unchanged |
| Database migrations | Unchanged |
| Kamailio routing | Unchanged |
| RTPengine | Unchanged |
| Telecom API contracts | Unchanged |
| PBX functionality | Unchanged |

---

## Related documents

- [RELEASE_PACKAGE.md](./RELEASE_PACKAGE.md)
- [FINAL_RC1_REPORT.md](./FINAL_RC1_REPORT.md)
