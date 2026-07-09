# 01 — Telecom Smoke Test Suite

| Field | Value |
|-------|-------|
| **Version** | 4.0.0-rc1 |
| **Branch** | `release/v4.0.0-rc1` |
| **Architecture** | Frozen — validation only |
| **EC2 compose** | `docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env` |

Set shell helpers once per session:

```bash
export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"
export API="https://127.0.0.1:3000/api"
export KAMHTTP="http://127.0.0.1:8880"
# Load from .env on server:
export TELECOM_SERVICE_AUTH_TOKEN=$(grep '^TELECOM_SERVICE_AUTH_TOKEN=' .env | cut -d= -f2-)
export JWT=$(curl -sk -X POST "$API/v1/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"SUPER_ADMIN_EMAIL","password":"SUPER_ADMIN_PASSWORD"}' | jq -r '.accessToken')
```

---

## 1. API validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 1.1 | Stack running | `$COMPOSE ps` | `vsp-api`, `vsp-kamailio`, `vsp-postgres`, `vsp-redis`, `vsp-rtpengine` **Up (healthy)** |
| 1.2 | Liveness | `curl -sk $API/health` | `{"status":"ok",...}` |
| 1.3 | Readiness | `curl -sk $API/ready` | `status: ok`, kamailio/rtpengine/postgres/redis up |
| 1.4 | Component probes | `curl -sk $API/health/{postgres,redis,kamailio,rtpengine,telnyx}` | Each `status: up` or carrier GREEN |
| 1.5 | Production readiness | `curl -sk -H "Authorization: Bearer $JWT" $API/v1/cutover/readiness` | `"ready": true` |
| 1.6 | Automated smoke | `curl -sk -X POST -H "Authorization: Bearer $JWT" $API/v1/cutover/smoke-test` | All tests `pass: true` |
| 1.7 | API logs | `$COMPOSE logs api --tail 100` | No `bootstrap.failed` |
| 1.8 | Config lint | `$COMPOSE exec api node -e "console.log('ok')"` | Exit 0 |

**RC1 note:** Automated smoke tests are **config + health probes**, not live call placement ([PL-03](../11-final-audit/KNOWN_LIMITATIONS.md)).

---

## 2. PostgreSQL validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 2.1 | Container health | `$COMPOSE ps postgres` | healthy |
| 2.2 | App DB | `$COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -c 'SELECT 1'` | `1` |
| 2.3 | Kamailio DB | `$COMPOSE exec -T postgres psql -U vsp -d kamailio -c 'SELECT 1'` | `1` |
| 2.4 | Version table | `$COMPOSE exec -T postgres psql -U vsp -d kamailio -c "SELECT * FROM version ORDER BY table_name;"` | `location=9`, `location_attrs=1`, `version=1` |
| 2.5 | Prisma connectivity | `curl -sk $API/health/postgres` | `status: up` |
| 2.6 | Migrations (if not applied) | `$COMPOSE run --rm api npx prisma migrate deploy` | Success |
| 2.7 | Connection count | `$COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -c "SELECT count(*) FROM pg_stat_activity;"` | Reasonable (< max_connections) |

---

## 3. Redis validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 3.1 | Container health | `$COMPOSE ps redis` | healthy |
| 3.2 | Ping | `$COMPOSE exec redis redis-cli ping` | `PONG` |
| 3.3 | API probe | `curl -sk $API/health/redis` | `status: up` |
| 3.4 | Persistence | `$COMPOSE exec redis redis-cli CONFIG GET appendonly` | `yes` |
| 3.5 | Memory | `$COMPOSE exec redis redis-cli INFO memory | grep used_memory_human` | Within capacity |

---

## 4. Kamailio validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 4.1 | Container health | `$COMPOSE ps kamailio` | healthy |
| 4.2 | HTTP health | `curl -s $KAMHTTP/health` | `"status":"ok"` |
| 4.3 | Config lint | `$COMPOSE exec kamailio kamailio -c -f /tmp/kamailio.runtime.cfg` | `config file ok` |
| 4.4 | DB bootstrap logs | `$COMPOSE logs kamailio 2>&1 | grep -E 'schema OK|bootstrap'` | `usrloc postgres schema OK` |
| 4.5 | SIP OPTIONS | `sngrep -d any port 5060` then `curl` or SIPp OPTIONS to `:5060` | 200 OK |
| 4.6 | TLS SIP | `openssl s_client -connect 127.0.0.1:5061 -servername sip.localhost </dev/null 2>/dev/null | head -5` | TLS handshake |
| 4.7 | WSS port | `ss -tlnp | grep 8443` | Kamailio listening |
| 4.8 | Usrloc persistence | `curl -sk -H "X-VSP-Service-Auth: $TELECOM_SERVICE_AUTH_TOKEN" $API/v1/ha/kamailio/persistence` | `mode: postgres`, `restartSafe: true` |
| 4.9 | Dispatcher list | `$COMPOSE exec kamailio cat /etc/kamailio/dispatcher.list` | rtpengine + telnyx entries |
| 4.10 | Process | `$COMPOSE exec kamailio pgrep -a kamailio` | kamailio running |

**Known non-fatal log:** `rtpengine rtpp_test(): proxy responded with invalid response` — Phase 4 NG stub ([TL-03](../11-final-audit/KNOWN_LIMITATIONS.md)).

---

## 5. RTPengine validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 5.1 | Container health | `$COMPOSE ps rtpengine` | healthy |
| 5.2 | UDP NG port | `ss -ulnp | grep 2223` | listening |
| 5.3 | Media range | `ss -ulnp | grep 10000` | UDP 10000–10099 |
| 5.4 | API probe | `curl -sk $API/health/rtpengine` | `status: up` |
| 5.5 | NG ping (in container) | `$COMPOSE exec rtpengine rtpengine-ng-ping 2>/dev/null || $COMPOSE exec rtpengine pgrep rtpengine` | Process/stub responds |
| 5.6 | Logs | `$COMPOSE logs rtpengine --tail 30` | No crash loop |

**RC1 limitation:** Stub is control-plane only — no real RTP media forwarding until `rtpengine-daemon` ([TL-02](../11-final-audit/KNOWN_LIMITATIONS.md)).

---

## 6. Telnyx validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 6.1 | Env | `grep -E '^TELNYX_' .env` | `TELNYX_SIP_HOST`, `TELNYX_WEBHOOK_SECRET` set (prod) |
| 6.2 | Carrier health | `curl -sk $API/health/telnyx` | GREEN / up |
| 6.3 | Carrier API | `curl -sk -H "X-VSP-Service-Auth: $TELECOM_SERVICE_AUTH_TOKEN" $API/v1/telecom/carrier/health` | Healthy |
| 6.4 | Dispatcher set 2 | `grep telnyx infrastructure/kamailio/dispatcher.list` | Telnyx targets present |
| 6.5 | Webhook (lab) | `curl -sk -X POST $API/v1/webhooks/telnyx -H 'Content-Type: application/json' -d '{}'` | 401/403 without valid HMAC in prod |
| 6.6 | Outbound SIP path | Manual INVITE to PSTN | 200/183 + RTP (requires live trunk) |

---

## 7. Grandstream validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 7.1 | Prov env | `grep -E '^PROV_|^SIP_' .env` | `PROV_PUBLIC_BASE_URL`, `PROV_HTTPS_ENABLED=true` |
| 7.2 | Enroll (admin JWT) | `curl -sk -X POST -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' $API/v1/provisioning/devices/enroll -d '{...}'` | 201 + deviceId |
| 7.3 | Config XML | `curl -sk -u "MAC:password" https://127.0.0.1:3444/gs/001122334455/cfg.xml` | Valid XML |
| 7.4 | Prov edge health | `curl -sk https://127.0.0.1:3444/health` | ok |
| 7.5 | SIP REGISTER | Phone registers to `SIP_PLATFORM_DOMAIN:5060/5061` | 200 OK |
| 7.6 | OPTIONS | Phone or SIPp OPTIONS | 200 OK |

---

## 8. WebRTC validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 8.1 | WSS URL env | `grep WEBRTC .env` | `WEBRTC_WSS_URL`, `JWT_SECRET` |
| 8.2 | Enroll | `curl -sk -X POST -H "Authorization: Bearer $JWT" $API/v1/telecom/webrtc/enroll -d '{...}'` | Credentials returned |
| 8.3 | WSS TLS | `openssl s_client -connect 127.0.0.1:8443 -servername wss.localhost </dev/null 2>/dev/null | head -5` | TLS ok |
| 8.4 | Admin softphone | Browser → `https://HOST:3001/softphone` | Register + call (manual) |
| 8.5 | STUN/TURN | `grep WEBRTC_STUN .env` | STUN configured; TURN optional |

---

## 9. TLS validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 9.1 | API HTTPS | `curl -skI $API/health` | HTTP 200 |
| 9.2 | Cert expiry | `openssl s_client -connect 127.0.0.1:3000 -servername api.localhost 2>/dev/null | openssl x509 -noout -dates` | Not expired |
| 9.3 | Kamailio SIP TLS | `openssl s_client -connect 127.0.0.1:5061 </dev/null 2>/dev/null | openssl x509 -noout -subject` | Matches SIP cert |
| 9.4 | TLS env | `grep -E '^TLS_' .env` | `TLS_ENABLED=true`, paths valid |
| 9.5 | Repo validate | `npm run tls:validate` (on build host) | Pass |

---

## 10. DNS validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 10.1 | SIP A/AAAA | `dig +short sip.example.com` | Points to Kamailio public IP |
| 10.2 | API | `dig +short api.example.com` | Points to API/LB |
| 10.3 | Prov | `dig +short prov.example.com` | Points to prov edge |
| 10.4 | Reverse PTR | `dig +short -x PUBLIC_IP` | Matches carrier expectations (if required) |
| 10.5 | Internal | `grep SIP_PLATFORM_DOMAIN .env` | Matches certificates SAN |

---

## 11. Firewall validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 11.1 | SIP UDP/TCP | `sudo ss -tulnp | grep -E '5060|5061'` | Kamailio bound |
| 11.2 | WSS | `sudo ss -tlnp | grep 8443` | Kamailio |
| 11.3 | API | `sudo ss -tlnp | grep 3000` | API |
| 11.4 | RTP range | `sudo ss -ulnp | grep 10000` | rtpengine |
| 11.5 | Security group | AWS console / `ufw status` | 5060/5061/8443/10000-10099 open as designed |
| 11.6 | Block test | From external host: `nc -vz PUBLIC_IP 5060` | Reachable if intended |

---

## 12. Docker validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 12.1 | All services | `$COMPOSE ps` | All critical healthy |
| 12.2 | Config render | `docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env config > /dev/null` | No errors |
| 12.3 | Image tags | `docker images | grep vsp-phone-v4` | api, kamailio, admin, rtpengine |
| 12.4 | Restart policy | `$COMPOSE ps --format json | jq '.[].Name'` | `unless-stopped` |
| 12.5 | Disk | `df -h /var/lib/docker` | >20% free |
| 12.6 | No restart loops | `$COMPOSE ps` after 5 min | Stable uptime |

---

## 13. Nginx validation

**RC1:** No bundled nginx — TLS terminates on NestJS/Kamailio/prov-edge. If operator uses external nginx:

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 13.1 | Config test | `sudo nginx -t` | syntax ok |
| 13.1 | Proxy API | `curl -sk https://api.example.com/api/health` | 200 via proxy |
| 13.3 | WebSocket upgrade | WSS through nginx to `:8443` | 101 Switching (manual) |
| 13.4 | Reference | `infrastructure/nginx/README.md` | Operator-owned config |

---

## 14. Certificate validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 14.1 | API cert chain | `openssl verify -CAfile infrastructure/tls/production/live/ca/ca.crt infrastructure/tls/production/live/api/fullchain.pem` | OK |
| 14.2 | Kamailio cert | Same for `live/kamailio/fullchain.pem` | OK |
| 14.3 | WSS SAN | `openssl x509 -in infrastructure/tls/production/live/wss/fullchain.pem -noout -text | grep DNS` | Includes WSS hostname |
| 14.4 | Prov cert | Port 3444 cert valid | OK |
| 14.5 | Rotation plan | Document in runbook | Defined |

---

## 15. Recording validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 15.1 | Env | `grep RECORDING .env` | Storage path or S3 configured |
| 15.2 | Intent API | Kamailio → `POST /v1/telecom/recording/intent` (via call flow) | Accepted |
| 15.3 | Admin list | `curl -sk -H "Authorization: Bearer $JWT" $API/v1/recordings` | 200 JSON |
| 15.4 | Media file | Check storage after call | **May fail RC1** — TL-02: metadata only |

---

## 16. Presence validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 16.1 | Redis backend | `$COMPOSE exec redis redis-cli KEYS 'vsp:presence:*' | head` | Keys after activity |
| 16.2 | API | `curl -sk -H "Authorization: Bearer $JWT" $API/v1/presence/lines/LINE_ID` | 200 |
| 16.3 | Telecom | `POST /v1/telecom/presence` with service auth | Accepted |
| 16.4 | WebRTC presence | `POST /v1/telecom/webrtc/presence` | Accepted |

---

## 17. BLF validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 17.1 | Subscribe API | `POST /v1/telecom/blf/subscribe` | Accepted |
| 17.2 | Presence subscribe | `POST /v1/telecom/presence/subscribe` | Accepted |
| 17.3 | Lamp on phone | Manual BLF key | **Partial RC1** — API foundation; live NOTIFY/lamp needs SIP e2e |

---

## 18. Queue validation

| # | Purpose | Command | Expected |
|---|---------|---------|----------|
| 18.1 | Media URI | `grep QUEUE_MEDIA_URI .env` | Real reachable SIP target (not placeholder) |
| 18.2 | Routing | INVITE → queue DID | APP_MEDIA_RELAY in Kamailio |
| 18.3 | Continue | DTMF/INFO → `/routing/continue` | Mid-call progression |
| 18.4 | Smoke test | Automated `queue` in cutover smoke | Pass if URI configured |

**Note:** Smoke test may check `TELECOM_QUEUE_MEDIA_URI` — align with `QUEUE_MEDIA_URI` in `.env`.

---

## 19. IVR validation

Same pattern as Queue — `IVR_MEDIA_URI`, APP_MEDIA, routing/continue. Requires real media application server.

---

## 20. Conference validation

Same pattern — `CONFERENCE_MEDIA_URI`, APP_MEDIA relay. Multi-party media requires real conference bridge + rtpengine-daemon for production media.

---

## Quick pass script (EC2)

```bash
#!/bin/bash
set -euo pipefail
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"
API="https://127.0.0.1:3000/api"

$COMPOSE ps
curl -sk "$API/health" | jq .
curl -sk "$API/ready" | jq .
$COMPOSE exec kamailio kamailio -c -f /tmp/kamailio.runtime.cfg
$COMPOSE exec -T postgres psql -U vsp -d kamailio -c "SELECT * FROM version;"
echo "Smoke suite prerequisites OK"
```

---

## Appendix A — Complete command reference

### Docker Compose

```bash
export COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml --env-file .env"

$COMPOSE ps
$COMPOSE ps -a
$COMPOSE config
$COMPOSE top
$COMPOSE logs --tail 200
$COMPOSE logs -f api kamailio
$COMPOSE logs api --since 1h
$COMPOSE restart kamailio
$COMPOSE exec api sh
$COMPOSE exec kamailio bash
$COMPOSE exec postgres bash
$COMPOSE exec redis redis-cli
$COMPOSE exec rtpengine sh
$COMPOSE stats --no-stream
$COMPOSE pull
$COMPOSE up -d --build
$COMPOSE down   # CAUTION: production only with approval
```

### curl / API

```bash
export API="https://127.0.0.1:3000/api"
export PROV="https://127.0.0.1:3444"

curl -sk "$API/health" | jq .
curl -sk "$API/ready" | jq .
curl -skI "$API/health"
curl -sk -w "\nHTTP %{http_code}\n" "$API/health/postgres"
curl -sk -X POST "$API/v1/auth/login" -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}'
curl -sk -H "Authorization: Bearer $JWT" "$API/v1/cutover/readiness"
curl -sk -X POST -H "Authorization: Bearer $JWT" "$API/v1/cutover/smoke-test"
curl -sk -H "X-VSP-Service-Auth: $TELECOM_SERVICE_AUTH_TOKEN" "$API/v1/telecom/health"
curl -sk "$PROV/health"
```

### PostgreSQL (psql)

```bash
$COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -c '\dt'
$COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -c "SELECT count(*) FROM \"User\";"
$COMPOSE exec -T postgres psql -U vsp -d kamailio -c "SELECT * FROM version;"
$COMPOSE exec -T postgres psql -U vsp -d kamailio -c "SELECT username, contact, expires FROM location LIMIT 10;"
$COMPOSE exec -T postgres psql -U vsp -d vsp_phone_v4 -c "SELECT pg_size_pretty(pg_database_size('vsp_phone_v4'));"
$COMPOSE run --rm api npx prisma migrate status
$COMPOSE run --rm api npx prisma migrate deploy
```

### Redis (redis-cli)

```bash
$COMPOSE exec redis redis-cli ping
$COMPOSE exec redis redis-cli INFO server
$COMPOSE exec redis redis-cli INFO memory
$COMPOSE exec redis redis-cli KEYS 'vsp:*' | head
$COMPOSE exec redis redis-cli MONITOR   # short window only
$COMPOSE exec redis redis-cli CONFIG GET appendonly
```

### Kamailio (kamcmd / kamctl / kamailio)

```bash
$COMPOSE exec kamailio kamailio -c -f /tmp/kamailio.runtime.cfg
$COMPOSE exec kamailio kamcmd core.version
$COMPOSE exec kamailio kamcmd core.uptime
$COMPOSE exec kamailio kamcmd dispatcher.list
$COMPOSE exec kamailio kamcmd ul.dump
$COMPOSE exec kamailio kamcmd dlg.list
$COMPOSE exec kamailio kamcmd ps
$COMPOSE exec kamailio kamctl stats
$COMPOSE exec kamailio kamctl ul show
$COMPOSE exec kamailio kamctl dispatcher list
curl -s http://127.0.0.1:8880/health
```

### RTPengine

```bash
$COMPOSE exec rtpengine pgrep -a rtpengine
$COMPOSE logs rtpengine --tail 50
ss -ulnp | grep 2223
ss -ulnp | grep 10000
```

### OpenSSL / TLS

```bash
openssl s_client -connect 127.0.0.1:3000 -servername api.localhost </dev/null 2>/dev/null | openssl x509 -noout -dates -subject
openssl s_client -connect 127.0.0.1:5061 -servername sip.localhost </dev/null 2>/dev/null | openssl x509 -noout -dates
openssl s_client -connect 127.0.0.1:8443 -servername wss.localhost </dev/null 2>/dev/null | head -20
openssl verify -CAfile infrastructure/tls/production/live/ca/ca.crt infrastructure/tls/production/live/api/fullchain.pem
npm run tls:validate
```

### Network (ss / netstat)

```bash
ss -tulnp
ss -tlnp | grep -E '3000|3001|3444|5060|5061|8443|8880'
ss -ulnp | grep -E '5060|2223|10000'
sudo lsof -i :5060
```

### Packet capture (tcpdump / ngrep / sngrep)

```bash
sudo sngrep -d any port 5060 or port 5061
sudo ngrep -d any -W byline port 5060
sudo tcpdump -i any -n host PUBLIC_IP and port 5060 -c 100
sudo tcpdump -i any -n udp portrange 10000-10099 -c 50
sudo tcpdump -i any -n host TELNYX_IP and port 5060 -w /tmp/telnyx.pcap
```

### DNS

```bash
dig +short sip.example.com A
dig +short api.example.com A
dig +short -x PUBLIC_IP
nslookup sip.example.com
host wss.example.com
```

### Host systemd / journal (bare-metal Kamailio if applicable)

```bash
sudo systemctl status docker
sudo systemctl status nginx   # if external reverse proxy
sudo journalctl -u docker -n 100 --no-pager
sudo journalctl -f
```

### Firewall (ufw / iptables)

```bash
sudo ufw status verbose
sudo iptables -L -n -v | head -40
```

### SIP load testing (SIPp — optional)

```bash
# OPTIONS flood (lab only)
sipp -sn uac -s 1000 127.0.0.1:5060 -m 1 -trace_msg
```

---

## Related

- [02-call-flow-validation.md](./02-call-flow-validation.md)
- [03-api-validation.md](./03-api-validation.md)
- [04-production-checklist.md](./04-production-checklist.md)
- [06-known-issues.md](./06-known-issues.md)
