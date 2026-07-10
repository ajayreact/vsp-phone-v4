# Monitoring

RC3 bundles optional **Prometheus** and **Grafana** for production observability.

## Quick start

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.monitoring.yml \
  up -d prometheus grafana
```

| Service | URL | Default creds |
|---------|-----|---------------|
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3002 | admin / admin (override via env) |

## Scrape targets

- `GET /api/health` — API liveness
- `GET /api/ready` — readiness
- `GET /api/v1/telecom/metrics` — Prometheus text metrics (requires `X-VSP-Service-Auth`)

Configure `TELECOM_SERVICE_AUTH_TOKEN` in Prometheus scrape config for secured metrics (internal network only in lab).

## Dashboards

Provisioned automatically: **VSP Phone v4 — Telecom Overview** (`vsp-telecom-rc3`).

## Alerting

Wire Alertmanager externally or extend `docker-compose.monitoring.yml` for production on-call routing.

