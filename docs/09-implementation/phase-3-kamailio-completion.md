# Phase 3 — Kamailio Base Configuration (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P3-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 3 Complete (static validation PASS; Docker runtime pending host Docker) |
| **Date** | 2026-07-08 |
| **Blueprint** | IMP-S5-001 Kamailio Base (user Wave-1 Phase 3) |
| **Depends On** | Phase 1–2 (infra + TLS) |

---

## 1. Module inventory

| Module | Purpose in Phase 3 |
|--------|--------------------|
| `tm` / `tmx` | Transactions |
| `sl` / `rr` / `pv` / `maxfwd` / `textops*` / `siputils` / `sanity` | Core SIP tooling |
| `usrloc` + `registrar` | Registrar foundation (`db_mode=0` memory) |
| `auth` | Digest framework loaded (NestJS verification later) |
| `permissions` | File-based address ACLs |
| `dispatcher` | Destination sets (RTP / Telnyx placeholders) |
| `dialog` | Dialog tracking foundation (`db_mode=0`) |
| `nathelper` + `path` | NAT + Path/Outbound prep for WSS |
| `pike` + `htable` | Anti-flood / IP ban table |
| `tls` | SIP TLS + WSS certificates |
| `websocket` + `xhttp` | WS handshake + HTTP `/health` |
| `rtpengine` | NG socket init (`udp:rtpengine:2223`) — no offer/answer yet |
| `ctl` / `cfg_rpc` / `jsonrpcs` / `counters` / `kex` / `corex` | Ops / RPC / metrics hooks |
| `xlog` | Structured SIP tracing to stderr |

**Not loaded (intentionally):** `http_client` / NestJS callouts, Redis usrloc, carrier dialplan logic.

---

## 2. Listener inventory

| Protocol | Bind | Role |
|----------|------|------|
| UDP | `0.0.0.0:5060` | SIP |
| TCP | `0.0.0.0:5060` | SIP |
| TLS | `0.0.0.0:5061` | SIP TLS |
| TCP | `0.0.0.0:8080` | WebSocket (WS) |
| TLS | `0.0.0.0:8443` | Secure WebSocket (WSS) |
| TCP | `0.0.0.0:8880` | HTTP health (`/health`, `/ready`) |

Compose publishes matching host ports (`KAMAILIO_*_PORT` in `.env.example`).

---

## 3. Startup validation

| Step | Mechanism |
|------|-----------|
| TLS present | Entrypoint requires `privkey.pem` + `fullchain.pem` when `KAMAILIO_REQUIRE_TLS=true` |
| Dispatcher / permissions files | Entrypoint hard-fail if missing |
| Config lint | `kamailio -c -f kamailio.cfg` before exec |
| RTPengine hint | Non-fatal `nc -z -u rtpengine:2223` |
| Healthcheck | `/healthcheck.sh` → process + `GET http://127.0.0.1:8880/health` |
| Static gate (host) | `npm run kamailio:validate` — **PASSED** |

**Docker daemon still absent on this workstation** — container start / SIP OPTIONS over the wire / module `ldd` checks remain for a Docker host:

```bash
npm run tls:generate
npm run kamailio:validate
docker compose build kamailio
docker compose up -d redis rtpengine kamailio
curl -s http://127.0.0.1:8880/health
# SIP OPTIONS (example): sipsak / SIPp against udp/5060
```

---

## 4. Logging configuration

| Setting | Value |
|---------|-------|
| Destination | stderr (`log_stderror=yes`) for Docker json-file driver |
| Facility | `LOG_LOCAL0` |
| Prefix | `{$mt $hdr(CSeq) $ci}` for Call-ID correlation in later phases |
| Levels | INFO for OPTIONS/REGISTER stub/HTTP health; WARN for pike/sanity; DBG for replies |
| User-Agent / Server | `VSP-Phone-v4-Kamailio` |

No SIP credentials logged. NestJS `platformUuid` correlation begins when routing APIs land (later phase).

---

## 5. RTPengine integration summary

| Item | Phase 3 state |
|------|----------------|
| `loadmodule "rtpengine.so"` | Yes |
| `rtpengine_sock` | `udp:rtpengine:2223` (Compose DNS name) |
| `dispatcher` set 1 | Documents RTP endpoint (attrs) |
| `rtpengine_offer/answer/delete` | **Not called** — deferred to media calling phases |
| Dependency | `depends_on: rtpengine` (started); reachability warning only |

---

## 6. Known limitations

1. **REGISTER** returns `503` stub — digest → NestJS is Phase 8/9.  
2. **INVITE / routing** returns `503` — Route Plan is a later phase.  
3. **usrloc** is memory-only — shared Redis location comes with Registration Service.  
4. **WebSocket** handshake enabled; softphone enroll/REGISTER not yet.  
5. **Telnyx dispatcher** entries are disabled placeholders.  
6. **Docker runtime validation** not executed on this host (no Docker CLI).  
7. Image must contain `rtpengine.so` (`kamailio-extra-modules`); Dockerfile warns if missing at build.

---

## 7. Phase 3 completion report / checklist

- [x] `kamailio.cfg` structure (defines, listeners, modules, routes)  
- [x] Module loading (registrar, usrloc, tm, dialog, dispatcher, permissions, auth, nat, pike, tls, websocket, rtpengine, xhttp)  
- [x] TLS module + `tls.cfg` (SIP TLS + WSS profile)  
- [x] Registrar + usrloc foundation  
- [x] Transaction (`tm`/`tmx`) + dialog foundation  
- [x] Dispatcher list + permissions address file  
- [x] Auth framework loaded (no NestJS call yet)  
- [x] NAT detection (`nathelper`) + Path  
- [x] RTPengine integration hooks (sock init only)  
- [x] SIP tracing / logging (`xlog` + `log_prefix`)  
- [x] Health endpoint (`xhttp` `:8880/health`)  
- [x] Docker startup validation (entrypoint lint + TLS gate + healthcheck script)  
- [x] Static validator `npm run kamailio:validate` **PASS**  
- [ ] Live container OPTIONS / module load — run on Docker host  

### Out of scope (confirmed deferred)

Registration API · Route Plan · call routing · queue · IVR · conference · Telnyx INVITE routing

### Exit decision

**Phase 3 implementation artifacts are complete.** Do **not** proceed to Phase 4 until this report is accepted. Prefer confirming `docker compose up kamailio` + `curl :8880/health` + SIP OPTIONS on a Docker workstation before Phase 4 schema work.

---

## Files touched

| Path | Change |
|------|--------|
| `infrastructure/kamailio/kamailio.cfg` | Phase 3 foundation rewrite |
| `infrastructure/kamailio/tls.cfg` | WSS server:8443 profile |
| `infrastructure/kamailio/dispatcher.list` | New |
| `infrastructure/kamailio/permissions.address` | New |
| `infrastructure/docker/Dockerfile.kamailio` | Extra modules + healthcheck |
| `infrastructure/docker/kamailio/docker-entrypoint.sh` | TLS/dispatcher gates + lint |
| `infrastructure/docker/kamailio/healthcheck.sh` | New |
| `docker-compose.yml` | Ports 8080/8880, volume mounts |
| `scripts/kamailio/validate-phase3.cjs` | New |
| `.env.example` / `Makefile` / `package.json` | `kamailio:validate` |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-08 | Phase 3 Kamailio base configuration |
