# VSP Phone v4 — Deployment Guide (Phase 2F)

## Three Portal Deployments

Build `admin` with `NEXT_PUBLIC_PORTAL=platform|ops|tenant` and map to admin.*, app.*, tenant.*.

## API

```bash
npx nx run api:build
npx prisma migrate deploy
```

## Health

- `GET /api/v1/health` — liveness
- `GET /api/v1/ops/health` — readiness

See `docs/07-deployment/ENVIRONMENT.md` and `docs/10-production/go-live-checklist.md`.
