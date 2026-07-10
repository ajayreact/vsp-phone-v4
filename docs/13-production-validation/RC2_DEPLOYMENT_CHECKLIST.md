# RC2 Deployment Checklist

| Version | 4.0.0-rc2 |
|---------|-----------|

## Pre-deploy

- [ ] Merge RC2 commit to release branch
- [ ] Run `npx nx run api:build --skip-nx-cache`
- [ ] Run `npx nx run admin:build --skip-nx-cache`
- [ ] Review `RC2_PRODUCTION_READINESS_REPORT.md` scores and open items

## Environment

- [ ] Set `VSP_ENV=production`
- [ ] Set `SWAGGER_ENABLED=false`
- [ ] Configure `CORS_ORIGINS` (must include admin, app, tenant origins)
- [ ] Configure JWT secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`)
- [ ] Configure Telnyx API keys and webhook URLs
- [ ] Set production TLS certificates (API + SIP)
- [ ] Configure MinIO/S3 for recordings and audio library
- [ ] Verify PostgreSQL connection pool and backups
- [ ] Verify Redis HA / persistence

## Infrastructure

- [ ] Deploy Kamailio with production config
- [ ] Deploy **rtpengine-daemon** (not stub) for media
- [ ] Configure reverse proxy (nginx/ALB) for three portal hostnames
- [ ] DNS: `admin.vspphone.com`, `app.vspphone.com`, `tenant.vspphone.com`
- [ ] Firewall: SIP 5060/5061, RTP range, WSS for softphone

## Database

- [ ] Run Prisma migrations: `npx prisma migrate deploy`
- [ ] Seed platform RBAC if fresh install
- [ ] Verify indexes on tenant-scoped tables

## Post-deploy smoke

- [ ] `GET /api/health` → 200
- [ ] `GET /api/ready` → 200
- [ ] Login on all three portals
- [ ] Ops dashboard loads telemetry
- [ ] Tenant extension CRUD + audit log entry
- [ ] Softphone registers via WSS
- [ ] Inbound test call → extension rings
- [ ] Supervisor live calls panel shows active call
- [ ] Telnyx number search (platform portal)

## Rollback

- [ ] Previous container images tagged and retained
- [ ] Database migration rollback plan documented
- [ ] Kamailio config previous version available

## Sign-off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Platform Engineering | | | |
| Telecom Operations | | | |
| Security | | | |
