# RTPengine (Phase 4 foundation)

Media proxy foundation per TEL-RTP-001 / ADR-009.

## Files

| File | Role |
|------|------|
| `rtpengine.conf` | NG listen, interfaces, ports, spool, timers |
| `rtpengine.env.example` | Optional overrides notes |

## Control

- NG: `udp://0.0.0.0:2223` (Kamailio `rtpengine_sock = udp:rtpengine:2223`)
- CLI: `127.0.0.1:2224` (when real daemon present)

## Validate

```bash
npm run rtpengine:validate
# Docker host:
docker compose build rtpengine
docker compose up -d rtpengine
docker compose exec rtpengine rtpengine-ng-ping
```

## Deferred

Recording pipeline, offer/answer dialplan, codec policy, TURN, kernel `table>=0` production forwarding.
