# RC3 Infrastructure Report

| Version | 4.0.0-rc3 |

## Media Plane — RTPengine

| Item | Before RC3 | After RC3 |
|------|------------|-----------|
| Default container backend | NG stub (no RTP) | Real daemon when `RTPENGINE_REQUIRE_DAEMON=1` |
| Install sources | apt only | apt + dfx.at bookworm repo |
| NAT | Static interface | Runtime `RTPENGINE_ADVERTISE` injection |
| Recording | Spool dir only | `recording-method = proc` active |
| Healthcheck | Process only | Rejects stub when production required |

**Files:** `infrastructure/docker/Dockerfile.rtpengine`, `install-or-stub.sh`, `docker-entrypoint.sh`, `healthcheck.sh`, `rtpengine.conf`

## Signaling — Kamailio

| Capability | Status |
|------------|--------|
| REGISTER / INVITE / BYE | Production |
| RTPengine offer/answer/delete | Production |
| WSS / TLS | Production |
| Dispatcher / Telnyx bridge | Production |
| **SIP REFER** | **Added RC3** |

## Object Storage — MinIO / S3

- MinIO included in production compose overlay (no `extras` profile)
- API wired via `S3_*` env vars and recording spool read mount

## Optional — coturn

- Profile `turn` in `docker-compose.prod.yml`
- Config: `infrastructure/turn/turnserver.conf`
- Set `WEBRTC_TURN_*` for corporate NAT

## High Availability

| Component | Restart policy (prod) | Recovery |
|-----------|----------------------|----------|
| postgres | always | `scripts/ops/backup-stack.sh` |
| redis | always | AOF persistence |
| kamailio | always | usrloc DB + Redis mirror |
| rtpengine | always | Sessions re-anchor on new calls |
| api | always | Stateless; health/readiness |

## Network Ports

| Service | Ports |
|---------|-------|
| SIP UDP/TCP | 5060 |
| SIP TLS | 5061 |
| WSS | 8443 |
| RTP | 10000–10099/udp |
| RTPengine NG | 2223/udp |
| API | 3000/3443 |
| Admin | 3001 |
| MinIO | 9000/9001 |
| Prometheus | 9090 |
| Grafana | 3002 |
| TURN | 3478 (optional) |

## Validation

```bash
npm run rc3:validate
```
