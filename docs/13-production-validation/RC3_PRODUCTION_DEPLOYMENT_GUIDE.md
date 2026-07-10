# RC3 Production Deployment Guide

| Version | 4.0.0-rc3 |

## 1. Prerequisites

- Linux host (Ubuntu 22.04+ recommended) with Docker Engine
- Public IP for `RTPENGINE_ADVERTISE`
- DNS: `api`, `admin`, `app`, `tenant` → host
- Telnyx account with SIP connection + API key
- TLS certificates (Let's Encrypt or enterprise PKI)

## 2. Configure environment

```bash
cp .env.example .env
# Set production secrets — see docs/07-deployment/ENVIRONMENT.md
```

Required production variables:

- `JWT_SECRET`, `TELECOM_SERVICE_AUTH_TOKEN`, `TELNYX_*`
- `RTPENGINE_ADVERTISE=<public-ip>`
- `RTPENGINE_REQUIRE_DAEMON=1`
- `CORS_ORIGINS=https://admin.vspphone.com,https://app.vspphone.com,https://tenant.vspphone.com`
- `S3_*` or MinIO defaults
- `QUEUE_MEDIA_URI`, `IVR_MEDIA_URI`, etc.

## 3. Deploy stack

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Optional monitoring:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.monitoring.yml up -d prometheus grafana
```

Optional TURN:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile turn up -d coturn
```

## 4. Database

```bash
docker compose exec api npx prisma migrate deploy
npm run platform:bootstrap
```

## 5. Nginx (HTTP portals)

```bash
sudo infrastructure/nginx/deploy-nginx.sh
```

SIP/WSS/RTP bypass nginx — open firewall:

- 5060/5061/tcp+udp, 8443/tcp, 10000-10099/udp

## 6. Validate

```bash
npm run rc3:validate
curl -sf https://api.vspphone.com/api/health
curl -sf https://api.vspphone.com/api/ready
docker compose exec rtpengine cat /etc/rtpengine/.backend  # must: real
```

## 7. Telecom smoke

Follow `docs/13-production-validation/01-telecom-smoke-tests.md` and `02-call-flow-validation.md`.

## 8. Backups

```bash
chmod +x scripts/ops/backup-stack.sh
BACKUP_DIR=/var/backups/vsp ./scripts/ops/backup-stack.sh
```

Schedule daily via cron.

## 9. Rolling updates

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps api admin
# Kamailio/rtpengine: brief call impact — maintenance window recommended
```

## 10. Rollback

- Retain previous image tags
- Restore Postgres from `backup-stack.sh` dump
- Revert Kamailio cfg via git tag
