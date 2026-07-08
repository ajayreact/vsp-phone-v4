# Phase 8 — Telnyx Carrier Integration (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P8-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 8 Complete (static validation PASS; live Telnyx trunk e2e pending) |
| **Date** | 2026-07-08 |
| **Scope** | Sprint 5 Wave 3 — PSTN via Telnyx Carrier Adapter |
| **Architecture** | TEL-CAR-001 / ADR-010 / ADR-021 / ADR-019 — frozen |
| **Constraint** | Phases 1–7 / Prisma / architecture frozen; media stubbed |

---

## 1. Carrier flow

### Outbound
```text
Line → Kamailio INVITE (E.164 R-URI)
  → intentHint=OUTBOUND + cli
  → POST /routing/resolve
  → CarrierService.validateCli + selectOutboundTrunk (TELNYX)
  → CallSession OUTBOUND_PSTN + platformUuid
  → Route Plan BRIDGE_CARRIER
  → Kamailio ds_select_dst(set=2) → sip.telnyx.com
  → PSTN (media not rewritten)
```

### Inbound
```text
PSTN → Telnyx → Kamailio (ACL group 2)
  → intentHint=INBOUND + dnis
  → PhoneNumber DID lookup → Line
  → CallSession INBOUND_PSTN + FORK registered devices
  → Relay (usrloc contacts)
```

Kamailio remains SIP signaling authority. NestJS decides Route Plan only.

---

## 2. Adapter summary

| Component | Path |
|-----------|------|
| Interface | `carrier-adapter.interface.ts` |
| Telnyx impl | `telnyx.carrier-adapter.ts` |
| Service | `carrier.service.ts` |
| HTTP | `GET /api/v1/telecom/carrier/health` |
| Failover | `POST /api/v1/telecom/carrier/failover` |

Trunk hints from `Carrier` rows (`carrierType=TELNYX`, `configuration` JSON: sipHost, dispatcherSet, health, backupSipHost). Secrets stay out of Prisma (env/`TELNYX_WEBHOOK_SECRET`).

Multi-tenant: selection always filtered by `tenantId`.

---

## 3. Webhook summary

| Path | Behavior |
|------|----------|
| `POST /api/v1/webhooks/telnyx` | Verify HMAC (stub-open if secret unset) → normalize → enrich `platformUuid` via Redis |
| `POST /api/v1/webhooks/carriers/telnyx` | Alias |

Normalization maps Telnyx event types → `call.progress` / `call.ended` / `number.lifecycle` / `carrier.*`. Does not drive SIP state (Kamailio remains authoritative).

---

## 4. Event summary

| Event | Source |
|-------|--------|
| `call.created` | PSTN resolve (INBOUND/OUTBOUND) |
| `carrier.webhook.normalized` | Webhook accept |
| `carrier.health` | Health endpoint |
| `carrier.failover.selected` | Failover hook |

Redis: `vsp:{tenant}:corr:telnyx:call:{id}`, `vsp:corr:telnyx:call:{id}`, platform corr gains `telnyxCallId`/`carrierCode`.

---

## 5. Validation report

| Check | Result |
|-------|--------|
| `npx nx build api` | **PASS** |
| `npm run telecom:validate:phase8` | **PASS** |
| Prisma schema diff | **None** |
| REGISTER / INTERNAL FORK paths | Intact |
| Dispatcher Telnyx active | **PASS** |
| IP ACL group 2 | **PASS** |
| No `rtpengine_offer/answer` | **PASS** |
| Live Telnyx trunk call | Pending credentials + Docker |

---

## 6. Known limitations

1. Media still stubbed (no RTPengine offer/answer).  
2. Live Telnyx IP ranges must be updated from published PoPs.  
3. Webhook signature is HMAC-SHA256 lab mode; production Ed25519 optional later.  
4. Queue/IVR destinations for DID still reject (`DNIS_NO_LINE`).  
5. Carrier REST DID search/order not implemented — uses existing `PhoneNumber`/`Carrier` rows.  
6. Softphone/Telnyx e2e not run on this host.

---

## 7. Checklist

- [x] Outbound PSTN routing (`BRIDGE_CARRIER`)  
- [x] Inbound PSTN / DID routing  
- [x] Carrier Adapter (Telnyx)  
- [x] SIP trunk / dispatcher set 2  
- [x] IP authentication ACL group 2  
- [x] Carrier health checks  
- [x] Failover hooks (`ds_next_dst` + HTTP failover API)  
- [x] Telnyx webhook receiver + normalization  
- [x] platformUuid correlation (Redis)  
- [x] CallSession lifecycle types INBOUND/OUTBOUND_PSTN  
- [x] Media stubbed; Phase 9 not started  

```bash
npm run build:api
npm run telecom:validate:phase8
```
