# RC3 Security Report

| Version | 4.0.0-rc3 |
| **Score** | **87/100** |

## RC3 Security Items

| Control | Status |
|---------|--------|
| Production Swagger disabled | Default `SWAGGER_ENABLED=false` in prod overlay |
| CORS three-portal default | admin, app, tenant |
| RTPengine stub blocked in prod | Health + build fail when require=1 |
| JWT / refresh | Unchanged — validated RC2 |
| Rate limits | Scoped guards active |
| TLS | Operator PKI; dev certs not for production |
| TURN credentials | Env-only; coturn optional profile |
| Metrics endpoint | Internal network; service auth recommended |

## Telecom-Specific

| Item | Notes |
|------|-------|
| SIP TLS | Kamailio 5061 + WSS 8443 |
| SRTP/DTLS | Negotiated via rtpengine |
| Webhook HMAC | `TELNYX_WEBHOOK_SECRET` required in prod |
| Service auth | `TELECOM_SERVICE_AUTH_TOKEN` Kamailio ↔ API |

## Pre-GA Checklist

- [ ] Rotate all secrets from lab defaults
- [ ] Restrict SIP/RTP ports via security group
- [ ] Enable WAF on HTTP portals
- [ ] Disable coturn default password
- [ ] Pen test WebRTC and provisioning URLs
