# 06 — Known Issues & Limitations (RC1)

| Field | Value |
|-------|-------|
| **Version** | 4.0.0-rc1 |
| **Status** | Architecture frozen — acceptance classification |

Severity: **Critical** = blocks production traffic | **High** = blocks feature | **Medium** = workaround exists | **Low** = cosmetic/docs

---

## Critical (production blockers)

| ID | Issue | Root cause | Fix | Status |
|----|-------|------------|-----|--------|
| — | *None for core infra acceptance* | EC2 stack healthy 2026-07-09 | — | ✅ Resolved |

**Note:** Core platform (API, Kamailio, DB, Redis) is operational. Critical items below apply to **specific features**, not stack boot.

---

## High

| ID | Issue | Root cause | Fix | Workaround |
|----|-------|------------|-----|------------|
| **H-01** | No RTP media forwarding | Phase 4 rtpengine **NG stub**, not daemon | Install/configure `rtpengine-daemon` in production image | Pilot signaling-only; no audio SLA |
| **H-02** | SIP REFER transfer missing | Not implemented (TL-01) | Post-RC1 Kamailio + API transfer routes | Manual call forward |
| **H-03** | Recording files not produced | RTPengine recording not active (TL-02) | Enable rtpengine recording + storage pipeline | Metadata/policy only |
| **H-04** | Production TLS not on EC2 lab | `TLS_ENABLED`/dev certs in `.env` | Deploy production PKI per `infrastructure/tls/production/` | Dev certs for lab only |

---

## Medium

| ID | Issue | Root cause | Fix |
|----|-------|------------|-----|
| **M-01** | Placeholder media URIs | `sip:*@media.vsp.internal` defaults (TL-04) | Set real `QUEUE/IVR/CONFERENCE_MEDIA_URI` |
| **M-02** | Smoke test env key mismatch | Tests check `TELECOM_*_MEDIA_URI` vs runtime `QUEUE_MEDIA_URI` | Align env names or update smoke-test.service |
| **M-03** | Device endpoint stub | `POST /telecom/device` returns `placeholder: true` (TL-05) | Use provisioning APIs |
| **M-04** | BLF lamp e2e partial | NOTIFY path not fully validated on phones | Live SIP acceptance with Grandstream |
| **M-05** | rtpengine rtpp_test log error | Stub invalid response to Kamailio probe | Expected until daemon; non-fatal |
| **M-06** | No bundled nginx | Operator responsibility | External reverse proxy per `infrastructure/nginx/README.md` |
| **M-07** | Firmware download ACL | Prov firmware URL network exposure (SL-02) | Network ACL / VPN |

---

## Low

| ID | Issue | Root cause | Fix |
|----|-------|------------|-----|
| **L-01** | Kamailio cfg warning line 423 | Constant expression in `if()` | Cosmetic; config valid |
| **L-02** | No Grafana/Alertmanager in repo (OL-03) | Deferred observability stack | External monitoring |
| **L-03** | No centralized log aggregation (OL-02) | JSON stdout only | Docker log driver |
| **L-04** | Stub domain modules (AL-01) | Engineering freeze M-08 | Post-RC1 |
| **L-05** | validate-remediation C-01 route name | Script expects `NESTJS_HTTP_HDRS`; cfg uses inline headers | Update validator only |

---

## Resolved during RC1 deployment (reference)

| Issue | Resolution |
|-------|------------|
| Kamailio `version` table missing | `bootstrap-usrloc.sql` + init script |
| Invalid AVP modparams | `$avp(...)` fixes |
| Empty dispatcher db_url | Removed |
| API RTPengine TCP probe | UDP probe |
| Kamailio postgres URL scheme | `postgres://` not `postgresql://` |
| Legacy location schema | Migration in bootstrap SQL |

---

## Re-validation after fixes

When fixing High items, re-run:

```bash
# From docs/13-production-validation/01-telecom-smoke-tests.md quick script
# Plus affected scenario from 02-call-flow-validation.md
```

| Fix target | Re-test |
|------------|---------|
| rtpengine-daemon | Scenarios 1–7 + RTP tcpdump |
| Production TLS | Section 9 + 14 smoke tests |
| Media URIs | Scenarios 10–11 + smoke queue/ivr |
| Telnyx prod | Scenarios 6–7 + webhook |

---

## Source documents

- [KNOWN_LIMITATIONS.md](../11-final-audit/KNOWN_LIMITATIONS.md)
- [PRODUCTION_APPROVAL.md](../11-final-audit/PRODUCTION_APPROVAL.md)
- [RELEASE_NOTES_v4.0.0_RC1.md](../12-release/RELEASE_NOTES_v4.0.0_RC1.md)
