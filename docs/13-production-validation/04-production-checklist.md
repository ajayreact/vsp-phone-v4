# 04 — Production Go-Live Checklist

| Field | Value |
|-------|-------|
| **Version** | 4.0.0-rc1 |
| **Use** | Final gate before production traffic |

Mark each item: ☐ Pending | ✅ Done | ❌ Blocked | N/A

---

## A. DNS

| # | Item | Owner | Notes |
|---|------|-------|-------|
| A1 | SIP FQDN (`sip.example.com`) → Kamailio public IP | Ops | A/AAAA |
| A2 | API FQDN → API or LB | Ops | |
| A3 | Admin FQDN → admin UI | Ops | `:3001` or proxied |
| A4 | Prov FQDN → prov edge `:3444` | Ops | Grandstream |
| A5 | WSS hostname matches cert SAN | Ops | `wss.example.com` |
| A6 | `SIP_PLATFORM_DOMAIN` in `.env` matches certs | Eng | |
| A7 | Reverse DNS (if carrier requires) | Ops | Telnyx |

```bash
dig +short sip.example.com A
dig +short api.example.com A
grep SIP_PLATFORM_DOMAIN .env
```

---

## B. TLS

| # | Item | Notes |
|---|------|-------|
| B1 | `TLS_ENABLED=true` | Production validator requires |
| B2 | `TLS_ENV=production` | |
| B3 | API cert valid + chain complete | `openssl verify` |
| B4 | Kamailio SIP TLS `:5061` | |
| B5 | Kamailio WSS `:8443` | |
| B6 | Prov edge `:3444` | |
| B7 | Cert expiry > 30 days | Calendar reminder |
| B8 | `npm run tls:validate` passed on build host | |

---

## C. Firewall / network

| # | Port | Protocol | Service |
|---|------|----------|---------|
| C1 | 5060 | UDP/TCP | SIP |
| C2 | 5061 | TCP/TLS | SIP TLS |
| C3 | 8443 | TCP/TLS | WSS |
| C4 | 3000 | TCP/TLS | API HTTPS |
| C5 | 3001 | TCP | Admin (restrict to ops VPN) |
| C6 | 3444 | TCP/TLS | Provisioning |
| C7 | 10000–10099 | UDP | RTP (adjust range in `.env`) |
| C8 | 2223 | UDP | RTPengine NG (internal only) |

```bash
sudo ss -tulnp | grep -E '5060|5061|8443|3000|10000'
```

---

## D. Carrier (Telnyx)

| # | Item |
|---|------|
| D1 | `TELNYX_SIP_HOST` configured |
| D2 | `TELNYX_WEBHOOK_SECRET` set (not placeholder) |
| D3 | Dispatcher list set 2 = Telnyx |
| D4 | DID numbers routed to platform |
| D5 | Outbound caller ID approved |
| D6 | STIR/SHAKEN / compliance (if applicable) |
| D7 | Webhook URL registered in Telnyx portal |

---

## E. Database

| # | Item |
|---|------|
| E1 | `vsp_phone_v4` app DB healthy |
| E2 | `kamailio` usrloc DB + `version` table |
| E3 | `npx prisma migrate deploy` applied |
| E4 | Backups scheduled (`BACKUP_LOCATION`, external pg_dump) |
| E5 | Connection limits sized for peak REGISTER |

```bash
docker compose exec -T postgres psql -U vsp -d kamailio -c "SELECT * FROM version;"
```

---

## F. Redis

| # | Item |
|---|------|
| F1 | AOF/RDB persistence enabled |
| F2 | Memory limit configured |
| F3 | Not shared with unrelated apps |

---

## G. Backups & DR

| # | Item |
|---|------|
| G1 | `BACKUP_LOCATION` writable |
| G2 | `POST /v1/ha/backup/execute` tested |
| G3 | Restore drill documented (non-destructive validate) |
| G4 | RPO/RTO agreed with stakeholders |

---

## H. Monitoring & health

| # | Item |
|---|------|
| H1 | Poll `GET /api/health` every 30s |
| H2 | Poll `GET /api/ready` for dependency gate |
| H3 | Kamailio `GET :8880/health` |
| H4 | Docker healthchecks enabled |
| H5 | Log aggregation (stdout → CloudWatch/Datadog) |
| H6 | Alert on container restart loop |

---

## I. Logs & alerts

| # | Item |
|---|------|
| I1 | JSON log format (`LOG_FORMAT=json`) |
| I2 | Alert: API `bootstrap.failed` |
| I3 | Alert: Kamailio exit 255 |
| I4 | Alert: Postgres disk > 80% |
| I5 | On-call runbook linked |

---

## J. Rollback

| # | Item |
|---|------|
| J1 | Previous image tags retained |
| J2 | `GET /v1/cutover/rollback-plan` reviewed |
| J3 | DNS TTL lowered before cutover |
| J4 | [rollback-runbook.md](../10-production/rollback-runbook.md) accessible |

---

## K. Operator accounts

| # | Item |
|---|------|
| K1 | Super Admin account created (not dev default) | `npm run platform:bootstrap` — see [08-platform-bootstrap.md](./08-platform-bootstrap.md) |
| K2 | `MIGRATION_DEV_SUPER_ADMIN=false` |
| K3 | RBAC roles assigned |
| K4 | JWT secret rotated from dev |

---

## L. Super Admin verification

```bash
curl -sk -X POST "$API/v1/auth/login" -d '{"email":"...","password":"..."}'
curl -sk -H "Authorization: Bearer $JWT" "$API/v1/cutover/readiness"
curl -sk -X POST -H "Authorization: Bearer $JWT" "$API/v1/cutover/smoke-test"
```

---

## M. Telnyx / Grandstream / WebRTC (traffic readiness)

| # | Item |
|---|------|
| M1 | At least one Grandstream registered |
| M2 | At least one WebRTC client registered |
| M3 | Inbound PSTN test call completed |
| M4 | Outbound PSTN test call completed |
| M5 | Internal extension call completed |

---

## N. Docker production (EC2 baseline)

| # | Item |
|---|------|
| N1 | `API_DOCKER_TARGET=production` |
| N2 | `ADMIN_DOCKER_TARGET=production` |
| N3 | Compose: `docker-compose.yml` + `prod` + `host-db` |
| N4 | `DATABASE_HOST=postgres` (Compose DB) |
| N5 | `KAMAILIO_USRLOC_PERSISTENCE=postgres` |
| N6 | All containers healthy 30+ minutes |

```bash
export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"
$COMPOSE ps
```

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Telecom lead | | | |
| Platform lead | | | |
| Security | | | |
| Operations | | | |
