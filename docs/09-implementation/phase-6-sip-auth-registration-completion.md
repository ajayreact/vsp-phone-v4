# Phase 6 — SIP Authentication & Registration (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P6-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 6 Complete (NestJS functional; Docker SIP UA lab pending host Docker) |
| **Date** | 2026-07-08 |
| **Scope** | Sprint 5 Wave 2 — SIP Digest Auth + Registration |
| **ADRs** | ADR-024, ADR-025, ADR-043, ADR-007, ADR-019 |
| **Constraint** | Phases 1–5 / Prisma schema / architecture frozen; no INVITE routing |

---

## 1. Authentication flow

```text
SIP REGISTER (no Authorization)
  → Kamailio auth_challenge → 401 Digest
SIP REGISTER (Authorization)
  → Kamailio parses Digest params
  → POST /api/v1/telecom/auth/sip-digest
       { aor, username, realm, nonce, response, method, uri, srcIp? }
  → NestJS:
       resolve SIPEndpoint (+ Device + DeviceAssignment + Tenant)
       tenant/realm isolation (ADR-025)
       vault HA1 (ADR-043 stub: SIP_VAULT_JSON / SIP_DEV_PASSWORD)
       MD5 digest verify (timing-safe)
       Redis auth cache (nonce+user, TTL 30s)
  → { allow, tenantId, deviceId, lineId?, expiresSec }
  → allow=false → Kamailio re-challenges (401)
  → allow=true  → usrloc save("location") → NestJS /register notify
```

**Alias:** `POST /api/v1/telecom/authenticate` remains for Phase 5 clients.

**platformUuid:** not required and not used on REGISTER / auth paths.

---

## 2. Registration flow

| Step | Behavior |
|------|----------|
| Auth OK | Kamailio `save("location")` → SIP 200 + Contact |
| Notify | `POST /register` with aor/contact/expires/deviceId/tenantId |
| Refresh | Same contact field → `registration.refreshed` |
| Multi-device / multi-contact | Redis hash fields per contact URI (`max_contacts=10`) |
| Expires=0 / unregister | `POST /unregister` → contact removal; empty AoR → UNREGISTERED |
| Expiry reconcile | Purge expired Redis fields; emit `registration.expired` |
| Prisma | Updates **only** `SIPEndpoint.registrationStatus`, `lastRegisteredAt`, `Device.status` — **never** Contact URI |

---

## 3. Redis synchronization summary

| Key | Value | TTL |
|-----|-------|-----|
| `vsp:auth:sip:{username}:{nonce}` | Allow JSON assertion | 30s |
| `vsp:{tenantId}:reg:{aor}` | Hash: contactURI → binding JSON | expiresSec + 30 |

Binding JSON: `{ contact, expiresAt, expiresSec, userAgent?, srcIp?, deviceId? }`.

NestJS Redis client soft-fails if Redis is down (auth may continue without cache; reg notify logs warning).

---

## 4. Usrloc summary

| Item | Phase 6 |
|------|---------|
| Module | `usrloc` + `registrar` (unchanged knobs) |
| Persistence | `db_mode=0` (memory) — Kamailio restart loses contacts |
| Sync model | NestJS Redis is the **durable multi-node mirror** for NestJS consumers; Kamailio memory usrloc is the SIP-plane store |
| Save | `save("location")` after NestJS allow |
| Shared Redis usrloc DB | Deferred (optional upgrade); Phase 6 documents memory + NestJS Redis mirror |

---

## 5. Event summary

| Event | When |
|-------|------|
| `registration.created` | First contact on AoR |
| `registration.refreshed` | Contact refresh / subsequent contact |
| `registration.unregistered` | Client unregister / expires=0 |
| `registration.expired` | TTL purge |
| `registration.auth_failed` | Digest deny reasons |

Listener: `RegistrationEventsListener` — structured JSON logs (outbox later).

---

## 6. Validation results

| Check | Result |
|-------|--------|
| `npx nx build api` | **PASS** |
| `npm run telecom:validate:phase6` | **PASS** (static + build) |
| Kamailio cfg validate (updated gate) | **PASS** — REGISTER NestJS path; INVITE still 503 stub |
| Prisma schema git diff | **None** (frozen) |
| Digest crypto unit smoke | **PASS** |
| Live REGISTER with softphone | Pending Docker host + seeded Tenant/Device/SIPEndpoint + vault password |
| Invalid credentials → 401 | Implemented (NestJS `allow:false` → Kamailio `auth_challenge`) |
| platformUuid on REGISTER | Not required |

---

## 7. Artifact index

| Path | Role |
|------|------|
| `apps/api/src/modules/telecom/auth/*` | Digest crypto, vault stub, auth service |
| `apps/api/src/modules/telecom/registration/*` | Register/unregister + Redis + Prisma status |
| `apps/api/src/modules/telecom/redis/*` | ioredis wrapper |
| `apps/api/src/modules/telecom/events/*` | Event types + listener |
| `apps/api/src/modules/telecom/prisma/prisma.service.ts` | Prisma 7 + `@prisma/adapter-pg` |
| `infrastructure/kamailio/kamailio.cfg` | `route[REGISTRAR]` HTTP auth |
| `scripts/telecom/validate-phase6.cjs` | Gate |

### Env (`.env.example`)

`SIP_PLATFORM_DOMAIN`, `SIP_DEV_PASSWORD`, `SIP_VAULT_JSON`, `SIP_DEFAULT_EXPIRES_SEC`, `TELECOM_SERVICE_AUTH_TOKEN`.

---

## 8. Known limitations

1. Vault is env/file stub — swap for real Secrets Manager without API change.  
2. Kamailio usrloc memory-only — HA requires shared location (later).  
3. `http_client` / `jansson` packages must be present in Kamailio image (`kamailio-json-modules` attempted).  
4. Softphone e2e REGISTER not executed on this workstation (no Docker).  
5. Empty `deviceId`/`tenantId` from Kamailio when jansson misses fields — NestJS resolves by AoR.  
6. Digest without qop (classic SIP MD5) — qop=auth supported in crypto helper if Kamailio sends nc/cnonce later.  
7. No INVITE / CallSession / Telnyx / RTP offer-answer.

---

## 9. Checklist

- [x] SIP Digest Authentication (`/auth/sip-digest`)  
- [x] REGISTER processing (Kamailio + NestJS)  
- [x] Registration persistence (business status fields only)  
- [x] Contact management (Redis hash; not Prisma)  
- [x] Refresh / expiry / unregister  
- [x] Multi-device / multi-contact  
- [x] DeviceAssignment + SIPEndpoint validation  
- [x] Tenant isolation via realm/AoR  
- [x] Kamailio ↔ NestJS integration  
- [x] Redis auth + registration cache  
- [x] usrloc `save("location")`  
- [x] Registration events  
- [x] INVITE remains stubbed  
- [x] Prisma schema unmodified  
- [x] Stop — Phase 7 not started  

```bash
npm run build:api
npm run telecom:validate:phase6
npm run kamailio:validate
```
