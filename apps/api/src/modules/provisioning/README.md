# Provisioning Module

Grandstream desk-phone provisioning (Phase 11 — TEL-PROV-001).

| Surface | Path |
|---------|------|
| HTTPS edge | `GET /gs/{mac}/cfg.xml`, `GET /fw/...` (PROV_HTTPS_PORT) |
| Admin API | `POST /api/v1/provisioning/devices/*` (JWT) |
| Internal render | `POST /api/v1/internal/provisioning/render` (service auth) |

Secrets (SIP digest, prov HTTP basic, admin password) live in the vault — not Prisma.
