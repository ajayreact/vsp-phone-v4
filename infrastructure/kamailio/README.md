# Kamailio (Phase 3 foundation)

Production-ready **base** configuration. NestJS owns business routing; RTPengine owns media.

## Files

| File | Role |
|------|------|
| `kamailio.cfg` | Listeners, modules, OPTIONS/health, stubs |
| `tls.cfg` | SIP TLS + WSS certs |
| `dispatcher.list` | RTPengine + Telnyx placeholder sets |
| `permissions.address` | Lab ACL groups |

## Listeners

| Proto | Port | Purpose |
|-------|------|---------|
| UDP/TCP | 5060 | SIP |
| TLS | 5061 | SIP TLS |
| TCP | 8080 | WebSocket (WS) |
| TLS | 8443 | Secure WebSocket (WSS) |
| TCP | 8880 | HTTP `/health` |

## Validate

```bash
npm run tls:generate
npm run kamailio:validate
# with Docker:
docker compose build kamailio && docker compose up -d kamailio rtpengine redis
curl -s http://127.0.0.1:8880/health
```

## Explicitly deferred

Registration digest via NestJS, Route Plan, queues/IVR/conference, Telnyx INVITE routing, Redis usrloc — later Sprint 5 phases.
