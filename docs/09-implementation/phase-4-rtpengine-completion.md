# Phase 4 — RTPengine Base Configuration (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P4-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 4 Complete (static validation PASS; Docker runtime pending host Docker) |
| **Date** | 2026-07-08 |
| **Blueprint** | User Sprint 5 Wave 1 Phase 4 (RTPengine foundation) |
| **Architecture** | TEL-RTP-001 / ADR-009 — frozen |
| **Depends On** | Phase 1–3 (infra, TLS, Kamailio base) |
| **Constraint** | Phases 1–3, Prisma, architecture — not modified |

---

## 1. RTPengine configuration summary

| Setting | Value | Purpose |
|---------|--------|---------|
| `foreground` | `true` | Docker PID 1 / docker logs |
| `log-stderr` | `true` | Compose json-file logging |
| `log-level` | `6` (overridable via `RTPENGINE_LOG_LEVEL`) | Verbose lab default |
| `table` | `-1` | Userspace forwarding (dev); kernel `table>=0` later |
| `listen-ng` | `0.0.0.0:2223` | NG control plane for Kamailio |
| `listen-cli` | `127.0.0.1:2224` | Local CLI when real daemon installed |
| `interface` | `internal/eth0` | Named media iface for later direction flags |
| `port-min` / `port-max` | `10000`–`10099` | RTP/SRTP media port pool |
| `timeout` / `silent-timeout` / `final-timeout` | `60` / `3600` / `10800` | Session timers |
| `delete-delay` | `30` | Grace after delete |
| `tos` | `184` | EF DSCP marking baseline |
| `max-sessions` | `5000` | Soft cap |
| `recording-dir` | `/var/spool/rtpengine` | Spool **prepared**; pipeline deferred |
| `recording-method` | `proc` | Placeholder for later capture |
| STUN | Documented (`stun-server` commented) | ICE assist when daemon supports key |
| ICE / DTLS / SRTP | Capability on **real** daemon; stub = NG-only | Per TEL-RTP-001 readiness |

**Control mapping to Kamailio (unchanged from Phase 3):**

`rtpengine_sock = udp:rtpengine:2223` — no `rtpengine_offer` / `answer` / `delete` in dialplan.

---

## 2. Media interface inventory

| Label / bind | Protocol | Port(s) | Role |
|--------------|----------|---------|------|
| Compose service `rtpengine` on `vsp_internal` | UDP | `2223` | NG control (`listen-ng`) |
| Host map `RTPENGINE_NG_PORT` | UDP | `2223` (default) | Lab NG from host |
| `listen-cli` | TCP | `2224` | CLI (real daemon); published for ops |
| Media pool `internal/eth0` | UDP | `10000–10099` | RTP / SRTP media |
| Spool volume `rtpengine_spool` | FS | `/var/spool/rtpengine` | Recording dir prep |
| Logs volume `rtpengine_logs` | FS | `/var/log/rtpengine` | Stub / daemon file logs |

Advertise / public EIP via `RTPENGINE_ADVERTISE` is documented for NAT labs; not applied as a dialplan/media rewrite in Phase 4.

---

## 3. Health validation

| Check | Mechanism | This host |
|-------|-----------|-----------|
| Process alive | `pgrep` in `/healthcheck.sh` | Requires Docker |
| NG ping | `rtpengine-ng-ping` (cookie + bencode `ping`) | Requires Docker |
| Image HEALTHCHECK | Dockerfile + Compose `healthcheck` → `/healthcheck.sh` | Requires Docker |
| Config keys at start | Entrypoint fails if `listen-ng`, `interface`, `port-*`, `recording-dir` missing | Requires Docker |
| Static gate | `npm run rtpengine:validate` | **PASSED** (incl. Node NG protocol smoke) |

```bash
npm run rtpengine:validate
# On a Docker host:
docker compose build rtpengine
docker compose up -d rtpengine
docker compose exec rtpengine rtpengine-ng-ping
docker compose ps rtpengine
```

---

## 4. Kamailio connectivity validation

| Item | Status |
|------|--------|
| Kamailio `loadmodule "rtpengine.so"` | Unchanged (Phase 3) |
| `rtpengine_sock = udp:rtpengine:2223` | Preserved — validate script asserts |
| Compose `depends_on: rtpengine` (service_started) | Unchanged |
| Offer / answer / delete | **Not added** (Phase 4 scope) |
| Runtime UDP reachability Kamailio → RTPengine | Pending Docker host (`nc -z -u rtpengine:2223` / NG ping from kamailio netns) |

Kamailio routing logic was **not** modified in this phase.

---

## 5. Logging configuration

| Layer | Behavior |
|-------|----------|
| Daemon / stub | stderr + optional `/var/log/rtpengine/` |
| Entrypoint | Startup lines: phase, conf path, backend (`real`/`stub`), spool note, ICE/DTLS readiness |
| Stub | Timestamped NG recv lines to stderr and `stub.log` |
| Compose | Shared `*default-logging` json-file driver |
| Level | `log-level = 6` / env `RTPENGINE_LOG_LEVEL` |

No media keys or SRTP material logged in Phase 4 (no media sessions yet).

---

## 6. Known limitations

1. **Docker CLI absent** on this workstation — container build/up, HEALTHCHECK, and in-cluster NG ping not executed here.  
2. **apt `rtpengine-daemon` may be unavailable** in the Debian base image; image falls back to **NG control stub** (ping/query ack only). Full RTP/SRTP/ICE/DTLS needs a real daemon package or custom build before call media phases.  
3. **Recording pipeline** not started — spool directory only.  
4. **Codec policies**, WebRTC signaling, Telnyx, and call routing — out of scope.  
5. **STUN** is documented/commented; not forced until daemon capability confirmed. **TURN** deferred.  
6. **`table = -1`** userspace only — production kernel forwarding later.  
7. Stub acknowledges NG messages without implementing full bencode offer/answer media engines.

---

## 7. Phase 4 completion report / checklist

- [x] RTPengine base configuration (`infrastructure/rtpengine/rtpengine.conf`)  
- [x] Docker image + entrypoint + install-or-stub + healthcheck  
- [x] Compose service (NG/CLI/media ports, volumes, env, HEALTHCHECK)  
- [x] NG control socket (`listen-ng` / stub bind `UDP 2223`)  
- [x] Logging (stderr + log volume + entrypoint banners)  
- [x] RTP/SRTP/ICE/DTLS **readiness** documented; real daemon when packaged  
- [x] STUN configuration documented (`stun-server` optional)  
- [x] Media interface configuration (`internal/eth0`, port pool)  
- [x] Recording directory preparation (`/var/spool/rtpengine`, Compose volume)  
- [x] Health check (`healthcheck.sh` + Dockerfile HEALTHCHECK)  
- [x] Startup validation (entrypoint required keys + `npm run rtpengine:validate`)  
- [x] Kamailio sock preserved; **no** offer/answer routing changes  
- [x] Deliverables documented in this report  
- [ ] Docker runtime smoke on a host with Docker (pending operator)

### Explicitly **not** done (deferred past Phase 4)

- Recording pipeline / call recording logic  
- Codec policies  
- WebRTC signaling  
- Telnyx integration  
- Call routing / `rtpengine_offer|answer`  

**Stop:** Phase 5 not started.

---

## 8. Artifact index

| Path | Role |
|------|------|
| `infrastructure/rtpengine/rtpengine.conf` | Base conf |
| `infrastructure/rtpengine/rtpengine.env.example` | Optional overrides notes |
| `infrastructure/rtpengine/README.md` | Ops quickstart |
| `infrastructure/docker/Dockerfile.rtpengine` | Image |
| `infrastructure/docker/rtpengine/docker-entrypoint.sh` | Startup validation |
| `infrastructure/docker/rtpengine/install-or-stub.sh` | Daemon or NG stub + `rtpengine-ng-ping` |
| `infrastructure/docker/rtpengine/healthcheck.sh` | HEALTHCHECK |
| `scripts/rtpengine/validate-phase4.cjs` | Static gate |
| `docker-compose.yml` (`rtpengine` service) | Runtime wiring |
| `.env.example` | Port/interface env keys |

---

## 9. Sign-off

Phase 4 RTPengine foundation is **complete** for static/repo deliverables. Operator must run Compose build/up + `rtpengine-ng-ping` on a Docker-capable host before treating media plane as runtime-verified. Architecture and Prisma remain frozen; Phases 1–3 untouched except prior approved work.
