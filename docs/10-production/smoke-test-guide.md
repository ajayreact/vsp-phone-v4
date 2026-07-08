# Smoke Test Guide — VSP Phone v4

| Field | Value |
|-------|-------|
| **Version** | 1.0.0 |
| **Phase** | 20 |

---

## Overview

Smoke tests validate that all critical platform components are ready for production traffic. Automated tests run via the cutover API; manual tests confirm end-to-end call behavior.

---

## Automated smoke tests

Execute via:

```bash
curl -X POST http://localhost:3000/api/v1/cutover/smoke-test \
  -H "Authorization: Bearer $JWT"
```

### Test coverage

| Test ID | Name | What it validates |
|---------|------|-------------------|
| `health_endpoints` | Health endpoints | All component health probes up |
| `sip_registration` | SIP registration | Kamailio up + SIP domain configured |
| `inbound_call` | Inbound call path | Kamailio + Telnyx carrier ready |
| `outbound_call` | Outbound call path | Telnyx SIP host configured |
| `internal_extension_call` | Internal routing | Kamailio routing available |
| `webrtc_registration` | WebRTC | JWT/WSS configured |
| `grandstream_registration` | Grandstream | Provisioning endpoint configured |
| `ivr` | IVR | IVR media URI configured |
| `queue` | Queue | Queue media URI configured |
| `conference` | Conference | Conference media URI configured |
| `park` | Park | Feature infrastructure available |
| `pickup` | Pickup | Feature infrastructure available |
| `recording` | Recording | Recording storage/Redis available |
| `presence` | Presence | Redis available for presence |
| `blf` | BLF | Presence backend available |
| `telnyx_webhook` | Telnyx webhook | Webhook secret configured |
| `health_endpoints` | Health endpoints | All probes green |

### Pass criteria

All tests must return `pass: true`. Review failures in the cutover report:

```bash
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3000/api/v1/cutover/report?format=csv"
```

---

## Manual smoke tests (post-automation)

After automated tests pass, execute these live tests in the lab or production window:

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1 | SIP registration | Register desk phone or softphone | 200 OK, registered |
| 2 | Inbound call | Call DID from external phone | Ring + answer |
| 3 | Outbound call | Dial external number from extension | Connected |
| 4 | Internal call | Extension-to-extension | Connected |
| 5 | WebRTC | Register browser client, place call | Connected |
| 6 | IVR | Call DID with IVR | Menu plays, DTMF works |
| 7 | Queue | Call queue DID | Agent ring, answer |
| 8 | Conference | Start conference, add participant | All parties connected |
| 9 | Park/Pickup | Park call, pickup from another extension | Call retrieved |
| 10 | Recording | Place recorded call | Recording file created |
| 11 | Presence/BLF | Change presence, observe BLF lamp | Lamp updates |
| 12 | Telnyx webhook | Trigger carrier event | Webhook received and processed |

---

## Troubleshooting

| Failure | Likely cause | Action |
|---------|--------------|--------|
| Kamailio down | Service not running | Check `GET /health/kamailio` |
| Telnyx down | Carrier config | Verify `TELNYX_SIP_HOST`, API credentials |
| WebRTC fail | JWT/WSS missing | Set `WEBRTC_WSS_URL`, `JWT_SECRET` |
| Provisioning fail | HTTPS not configured | Set `PROV_PUBLIC_BASE_URL` |

---

## Related documents

- [Production Runbook](./production-runbook.md)
- [Post-Go-Live Verification Guide](./post-go-live-verification-guide.md)
