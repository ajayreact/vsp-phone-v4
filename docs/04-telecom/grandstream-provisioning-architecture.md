# VSP Phone v4 — Grandstream Provisioning Architecture

| Field | Value |
|-------|-------|
| **Document ID** | TEL-PROV-001 |
| **Version** | 1.0.0 |
| **Status** | Architecture — Sprint 4.5 Design |
| **Last Updated** | 2026-07-08 |
| **Owner** | Telecom Architecture |
| **Location** | `docs/04-telecom/grandstream-provisioning-architecture.md` |
| **Depends On** | ADR-002, ADR-003, ADR-004, ADR-007, ADR-008, ADR-011, ADR-014, ADR-015, ADR-017; TEL-KAM-002; TEL-RTP-001; TEL-CAR-001; TEL-WRTC-001; Frozen business domains |

---

## Purpose

This document defines the **enterprise Grandstream SIP desk-phone provisioning architecture** for VSP Phone v4: zero-touch enrollment, secure HTTPS configuration delivery, firmware lifecycle, multi-tenant isolation, and integration with the frozen Telephony domain (`Device`, `DeviceAssignment`, `Line`, `Extension`, `SIPEndpoint`).

Architecture exercise only. No provisioning XML templates, Docker files, Kamailio cfg, NestJS code, or Prisma redesign.

**Frozen:** Identity, Telephony, Call Engine, Kamailio, RTPengine, Telnyx carrier, WebRTC signaling.

**Hard boundaries**

- NestJS owns provisioning orchestration, device lifecycle, and config generation policy.
- The Provisioning Server owns HTTPS config/firmware *delivery* only.
- Kamailio owns SIP signaling **after** the phone is configured (REGISTER / INVITE).
- RTPengine owns media for calls — **never** provisioning transport.
- **No** SIP Call-ID, contact bindings, RTP ports, or device-specific runtime SIP state in the business Prisma schema.
- MAC → Tenant → Line resolution uses existing Telephony models; do not invent parallel inventory schemas in Prisma.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Grandstream Responsibilities](#2-grandstream-responsibilities)
3. [Provisioning System Architecture](#3-provisioning-system-architecture)
4. [Device Enrollment Workflow](#4-device-enrollment-workflow)
5. [Configuration Generation Strategy](#5-configuration-generation-strategy)
6. [Firmware Management](#6-firmware-management)
7. [Security Architecture](#7-security-architecture)
8. [Multi-Tenant Provisioning Design](#8-multi-tenant-provisioning-design)
9. [Device Lifecycle Management](#9-device-lifecycle-management)
10. [Versioning & Rollback Strategy](#10-versioning--rollback-strategy)
11. [Observability Architecture](#11-observability-architecture)
12. [Risks & Trade-offs](#12-risks--trade-offs)
13. [Recommended ADRs](#13-recommended-adrs)
14. [Enterprise Readiness Assessment](#14-enterprise-readiness-assessment)
15. [Final Architecture Recommendation](#15-final-architecture-recommendation)

---

## 1. Executive Summary

Grandstream GRP/GXP desk phones are the first **hardware SIP endpoints** in VSP Phone v4. They are configured by NestJS-owned provisioning and then behave as ordinary SIP UAs that register to Kamailio — the same signaling plane used by WebRTC softphones ([TEL-WRTC-001](./webrtc-signaling-architecture.md)).

```text
Admin / Logistics          Phone (GRP / GXP)
        │                        │
        │  MAC / model / site     │  HTTPS GET cfg + firmware
        ▼                        ▼
   NestJS Provisioning Service ←→ Provisioning Server (HTTPS edge)
        │                        │
        │  Device / Assignment / SIPEndpoint / secrets
        ▼
   PostgreSQL (Telephony) + Secrets Manager
        │
        │  (post-provision only)
        ▼
   Kamailio REGISTER ──► RTPengine (calls only)
```

This matches Dialpad / RingCentral / Zoom Phone–class desk-phone ops: RPS or staged config-server redirect, authenticated HTTPS config pull, template-driven P-value/XML generation, MAC uniqueness, and SIP registration separate from HTTP provisioning.

**Sprint 4.5 scope:** Grandstream GRP & GXP families ([ADR-011](../ADR/ADR-011-grandstream-provisioning.md)). Yealink / Fanvil / Poly remain future vendors with the same pipeline shape.

---

## 2. Grandstream Responsibilities

### What Grandstream devices own

| Responsibility | Description |
|----------------|-------------|
| Config pull | Initiate HTTPS upgrade/provision requests to the Config Server Path |
| Firmware apply | Download and apply firmware packages from the Firmware Server Path |
| Local UI / ACL | Device web UI (locked down post-provision); admin password from config |
| SIP UA | REGISTER / INVITE / BYE to Kamailio using provisioned AoR + digest |
| Media endpoint | RTP/SRTP toward RTPengine as directed by SDP from Kamailio |
| Periodic check | Honor “Always Check / Check on boot / scheduled” firmware & config policies |

### What Grandstream devices never own

- Tenant / Line / User business rules  
- Route Plan, DNIS, recording decisions (server-side Call Engine / Kamailio / RTPengine)  
- Multi-tenant isolation logic  
- Credential issuance policy (NestJS secrets + SIPEndpoint)  
- Kamailio location / dialog state  

### Platform framing

Grandstream is a **managed SIP Device** (`DeviceType.DESK_PHONE`) on a **Line**. Provisioning is the bridge from physical MAC inventory to a registered SIPEndpoint. After first successful register, call behavior is identical to any other Kamailio-registered Device ([TEL-KAM-002](./kamailio-telecom-integration-architecture.md)).

Official Grandstream guidance (GRP/GXP Security & Firmware Upgrade manuals) aligns with this design:

- Prefer **HTTPS** for config and firmware  
- Optional HTTP/HTTPS username/password on the provisioning server  
- Optional config-file authentication (`P1` admin password match)  
- **Validate Server Certificates** for production  
- XML config with optional encryption for sensitive deployments  

---

## 3. Provisioning System Architecture

### 3.1 Component diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│ NestJS Application                                               │
│  ┌──────────────────┐  ┌────────────────────┐  ┌──────────────┐ │
│  │ Device Lifecycle │→ │ Provisioning       │→ │ Config       │ │
│  │ (Telephony APIs) │  │ Orchestrator       │  │ Generator    │ │
│  └──────────────────┘  └─────────┬──────────┘  └──────┬───────┘ │
│                                  │                     │         │
│                                  │ events              │ render  │
│                                  ▼                     ▼         │
│                         ┌─────────────────────────────────────┐ │
│                         │ Artifact Store (object storage)     │ │
│                         │ templates / rendered cfg / firmware │ │
│                         └──────────────────┬──────────────────┘ │
└────────────────────────────────────────────┼────────────────────┘
                                             │ publish artifacts
                                             ▼
                              ┌──────────────────────────────┐
                              │ Provisioning Server (HTTPS)  │
                              │ CDN / edge · auth · rate lim │
                              └──────────────┬───────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    ▼                        ▼                        ▼
              GRP / GXP                 GRP / GXP                 …
              (tenant A)                (tenant B)
```

### 3.2 Ownership boundaries

| Component | Owns | Never owns |
|-----------|------|------------|
| **Grandstream device** | Pull cfg/firmware; apply; SIP UA; local UI | Tenant rules; Prisma; Kamailio location |
| **Provisioning Service (NestJS)** | Enrollment, MAC→Device resolution, template selection, render triggers, re-provision policy, firmware catalog, audit events | SIP REGISTER / INVITE; RTP; carrier webhooks |
| **Configuration Generator** | Vendor-specific template → device cfg artifact (P-values / XML) | Serving files over HTTPS; SIP digest auth to Kamailio |
| **Provisioning Server** | TLS termination, MAC-scoped HTTPS auth, artifact delivery, firmware blobs | Business DB writes; Route Plans; media |
| **NestJS (broader)** | Secrets for SIP digest, `SIPEndpoint` business row, DeviceAssignment, CallSession `platformUuid` | Device contact bindings / Call-ID |
| **Kamailio** | Digest REGISTER; dialogs; NG to RTPengine | HTTP provisioning; MAC inventory |
| **RTPengine** | Call media only | Provisioning traffic |

### 3.3 ADR-011 flow (refined)

```text
Phone
  → Provisioning Server (HTTPS edge)
      → auth + authorize MAC/token
      → fetch cached artifact OR ask NestJS to render
  → NestJS Provisioning Service (orchestrate if miss / stale)
      → Configuration Generator
      → Artifact Store
  → Device applies config
  → Kamailio REGISTER  (separate plane)
```

Phone-initiated pull remains the primary path (Grandstream native). NestJS may *notify* or *queue* re-provision (config change event → bump generation → optional SIP NOTIFY / reboot instruct where supported), but **does not** push proprietary binary streams through Kamailio.

### 3.4 Data planes

| Plane | Store | Content |
|-------|-------|---------|
| Business inventory | Prisma Telephony | `Device`, `DeviceAssignment`, `Line`, `Extension`, `SIPEndpoint` metadata (AoR, auth username, registration *business* status sync) |
| Secrets | Secrets Manager / vault (not plaintext Prisma) | SIP digest secret / HA1; provisioning HTTP basic/token; device admin password |
| Provisioning ops | Redis / object store / dedicated ops tables *outside* call runtime SIP | Template versions, render jobs, artifact keys, firmware channel pins, last-provision attempt |
| SIP runtime | Kamailio Redis location | Contacts, Call-ID — **not** business schema |

**Constraint:** Do not store device-specific runtime SIP state (contacts, Call-ID, SDP) in Prisma. Periodic `SIPEndpoint.lastRegisteredAt` sync via NestJS events remains acceptable ([TEL-KAM-002](./kamailio-telecom-integration-architecture.md)).

### 3.5 Scale target

Design for **thousands of devices per region**:

- Artifact CDN / object storage for hot config & firmware  
- Idempotent render; content-addressed artifacts (`hash(mac, templateVer, lineVersion, secretsGen)`)  
- Horizontal Provisioning Server; NestJS render workers behind queue  
- Rate limits per MAC and per Tenant  
- No per-REGISTER round-trip to the Configuration Generator  

---

## 4. Device Enrollment Workflow

### 4.1 Pre-staging (recommended enterprise default)

Ops or reseller flow before the phone power-cycles on customer LAN:

1. Admin creates or imports **MAC** + model family (GRP/GXP) into a Tenant.  
2. Platform creates `Device` (`deviceType = DESK_PHONE`, `status = PROVISIONING`, `macAddress` unique per tenant — and platform uniqueness policy per [ADR-011](../ADR/ADR-011-grandstream-provisioning.md)).  
3. Admin assigns User + Line → new `DeviceAssignment` (`effectiveFrom`, optional `lineId`); updates `Device.lineId` / `Device.userId`.  
4. NestJS ensures `SIPEndpoint` exists (AoR, `authUsername`); issues SIP secret into secrets manager; links `Device.sipEndpointId`.  
5. Provisioning Service generates **bootstrap token** (or HTTP credentials) bound to MAC + Tenant.  
6. RPS / redirection path (Grandstream Redirect / RPS or first-boot factory redirect) points Config Server Path to VSP HTTPS edge:  
   `https://prov.vsp.example/{tenantPublicId|region}/gs/{mac}.xml` (exact URL scheme deferred to ADR).  
7. Phone boots → HTTPS GET → authenticated → downloads cfg → applies → reboots if needed → **REGISTER** to Kamailio.  
8. On first successful register event, NestJS may advance `Device.status` toward `REGISTERED` / `ONLINE` (via telecom→NestJS events — not in-band SIP into Prisma).

### 4.2 Zero-touch patterns

| Pattern | Use when | Behavior |
|---------|----------|----------|
| **RPS / Redirect** | Cloud / branch unknown LAN | Factory or distributor RPS maps MAC → VSP Config Server Path |
| **DHCP Option 66/43 / custom** | Managed LAN | DHCP supplies config server host; MAC still authenticates |
| **Staged / URL paste** | Small sites / first devices | Technician sets Config Server Path + HTTPS once; thereafter automatic |

All patterns converge on the same NestJS enrollment + HTTPS delivery pipeline.

### 4.3 Auto-discovery of unknown MAC

```text
Unknown MAC HTTPS request
  → Provisioning Server authenticates transport (mTLS / shared edge only)
  → NestJS: MAC not in Device inventory
  → Outcome A: Reject (default — no open auto-join)
  → Outcome B: Quarantine queue (tenant ops must claim MAC)
  → Outcome C: Pre-authorized MAC pool claim (optional enterprise feature)
```

**Default enterprise posture:** no silent cross-tenant auto-join. Unclaimed MACs go to quarantine audit, not config with SIP credentials.

### 4.4 DeviceAssignment as enrollment ledger

`DeviceAssignment` is the **authoritative history** of who/which Line owned the phone:

| Event | DeviceAssignment action | Provisioning action |
|-------|-------------------------|---------------------|
| First assign | Insert row `effectiveFrom=now`, `effectiveTo=null` | Render + publish cfg |
| Reassign User/Line | Close prior (`effectiveTo`), insert new | Re-render SIP identity + reprovision |
| Decommission | Close assignment; soft-delete Device | Invalidate artifacts; revoke SIP secret |

Current Line/User also denormalized on `Device` for query speed (existing schema) — assignments remain audit source of truth.

### 4.5 Post-enrollment SIP

Provisioning ends when:

1. Config successfully applied (device ack / subsequent check-in), and  
2. Kamailio accepts REGISTER for the provisioned AoR.

Failed REGISTER is a **telecom auth / network** incident, not a provisioning template bug — triage via SIP logs + Device status, not by writing contacts into Prisma.

---

## 5. Configuration Generation Strategy

### 5.1 Inputs (from frozen Telephony — read only)

| Source | Config outputs (conceptual) |
|--------|-----------------------------|
| `Device` | MAC, name, model family, status |
| `Line` | Display name / identity context |
| `Extension` | Dialable extension labels / BLF stubs (BLF future) |
| `CallerID` | Outbound presentation fields where phone UI needs them |
| `SIPEndpoint` | AoR, auth username, outbound proxy = Kamailio edge |
| `RecordingPolicy` / `CallPolicy` | **Server-enforced**; only provide on-phone *hints* (e.g. recording tone) if product requires — never duplicate policy engines on the handset |
| Tenant branding | Logo / wallpaper / language ([ADR-011](../ADR/ADR-011-grandstream-provisioning.md)) |
| Site / TenantSettings | Timezone, language |

### 5.2 Template layers

```text
Platform base template (GRP261x / GXP21xx family)
  + Tenant overrides (branding, codecs policy, TLS profile)
  + Site overrides (timezone, NTP, emergency dial strings)
  + Line / Device instance variables (SIP, extension, secrets refs)
  = Rendered artifact (content-addressed)
```

Templates are **versioned** ([ADR-011](../ADR/ADR-011-grandstream-provisioning.md)). Generator never embeds raw secrets into source-controlled templates; secrets inject at render time from vault.

### 5.3 Artifact types

| Artifact | Purpose |
|----------|---------|
| Device cfg (XML / P-value) | Account, proxy, SRTP preference, HTTPS provision URLs, admin password |
| Common / partial cfg | Shared non-secret settings for efficiency (optional) |
| Firmware package | Model-specific official Grandstream build |
| Branding assets | Wallpaper / logo (HTTPS URLs inside cfg) |

### 5.4 Integration with telephony policies

| Policy domain | On phone? | On server? |
|---------------|-----------|------------|
| Lines / multi-device ring | Phone registers one AoR; Line may ring multiple Devices | Kamailio + Call Engine fork/route |
| Extensions | Shown on display / dialplan stubs | Authoritative Extension table |
| Caller ID | May set display/outbound CLIP fields | Authoritative CallerID + carrier CLI |
| RecordingPolicy | Optional beep / softkey; no storage control | RTPengine recording + NestJS Recording |
| CallPolicy (DND, forward, hours) | Limited local DND if allowed | Authoritative CallPolicy + Route Plan |

**Principle:** Handset config is an **optimized edge view** of Telephony; NestJS / Kamailio remain authoritative for call treatment.

### 5.5 Re-generation triggers

- `DeviceAssigned` / Line change / Extension change / CallerID change  
- SIP credential rotation  
- Template version promotion  
- Tenant branding update  
- Firmware channel pin change (may also force firmware check)  
- Explicit admin “Reprovision”  

Events align with [ADR-014](../ADR/ADR-014-event-driven-architecture.md) (`DeviceAssigned` and follow-on provisioning events via recommended ADRs).

---

## 6. Firmware Management

### 6.1 Strategy

| Pillar | Decision |
|--------|----------|
| Source of truth | Curated **firmware catalog** in NestJS (model → approved versions) |
| Binary store | Object storage / Provisioning Server; not Grandstream public CDN for locked-down tenants (mirror) |
| Pinning | Per Tenant (or Site) **channel**: `stable` / `n-1` / `emergency` |
| Delivery | HTTPS Firmware Server Path (same security posture as config) |
| Check policy | Prefer “check on boot + periodic”; **scheduled windows** deferred ([ADR-011](../ADR/ADR-011-grandstream-provisioning.md) future) |
| Rollout | Canary by Site / MAC cohort → tenant fleet |
| Rollback | Pin previous catalog version; force check; avoid dual-dir open download of unapproved builds |

### 6.2 Lifecycle

```text
Vendor publish → Security/QA accept into catalog → Mirror to artifact store
  → Pin channel → Render firmware path into cfg (or dedicated firmware URL)
  → Devices check → Upgrade → Inventory sync (reported firmware version)
```

### 6.3 Constraints

- Do not auto-upgrade entire multi-tenant fleets without pin + canary.  
- Firmware and config versions are independent axes.  
- Failed upgrades: quarantine device status; do not mass-reblast without operator ack.

---

## 7. Security Architecture

### 7.1 Transport

- **HTTPS only** for config and firmware ([ADR-011](../ADR/ADR-011-grandstream-provisioning.md)).  
- Valid public or enterprise PKI certs; enable **Validate Server Certificates** on devices.  
- Prefer modern TLS; disable cleartext TFTP/HTTP in production profiles.

### 7.2 Device authentication to Provisioning Server

Defense in depth (combine as per ADR):

| Control | Role |
|---------|------|
| MAC-bound URL + uniqueness | Lookup key |
| HTTP Basic / Digest or bearer token per device | Prevent credential stuffing across MACs |
| Short-lived signed URL (optional) | Time-boxed artifact fetch |
| Edge mTLS / WAF / IP allowlists | Extra for on-prem CPE denseness |
| Rate limiting + anomaly alerts | Brute-force / scanning |

Unknown MAC → quarantine; never return another tenant’s cfg.

### 7.3 Config integrity

- Optional Grandstream **authenticate config file** via admin password (`P1` pattern).  
- Optional encrypted XML cfg where required.  
- Rotate phone admin password on enroll / reassign.  
- Disable remote UI from WAN post-provision.

### 7.4 SIP credentials

- Distinct from User JWT passwords ([ADR-007](../ADR/ADR-007-authentication-authorization.md), [TEL-KAM-002](./kamailio-telecom-integration-architecture.md)).  
- Stored in secrets manager; `SIPEndpoint.authUsername` + AoR in Prisma; **no password column in Prisma**.  
- Rotation: generate new secret → re-render cfg → revoke old after grace → Kamailio auth uses new HA1.

### 7.5 Certificate management

| Cert | Owner | Notes |
|------|-------|-------|
| Provisioning Server TLS | Platform PKI / ACME | Wildcard or `prov.*`; dual-stack ready |
| Optional client certs (mTLS) | Per-fleet / Site | Where Grandstream models support |
| Device trust store | Template-managed CA pins | For private PKI |
| Kamailio SIP TLS (if used) | Separate from HTTP prov | Do not conflate planes |

### 7.6 Multi-tenant hard rules

- Resolve Tenant **before** any SIP secret injection.  
- Artifact paths include tenant-scoped authorization checks, not security-by-obscurity alone.  
- Cross-tenant MAC move = **new enroll** after revoke (no silent migrate).

---

## 8. Multi-Tenant Provisioning Design

```text
                    ┌──────────── Tenant A ────────────┐
Request MAC M ──►  │ Device(M) · Line · SIPEndpoint   │──► cfg_A
                    └──────────────────────────────────┘
Unknown / other
tenant MAC     ──►  Reject / quarantine (no cfg_B leak)
```

| Control | Mechanism |
|---------|-----------|
| Data | `tenantId` on Device, Assignment, Line, SIPEndpoint |
| AuthZ | Provisioning edge verifies MAC ↔ Tenant binding |
| Isolation | Separate artifact prefixes; no shared world-readable buckets |
| Ops | Admin APIs scoped by tenant JWT / membership |
| RPS | MAC maps to single Tenant; change ownership = controlled transfer workflow |

MAC uniqueness: **platform-global uniqueness** as decided in ADR-011 (enforced in addition to `@@unique([tenantId, macAddress])` in Prisma — resolve any operational conflict via proposed ADR if duplicates appear across tenants in rare hardware reuse).

---

## 9. Device Lifecycle Management

### 9.1 States (business)

Align with existing `DeviceStatus` (`PROVISIONING`, `REGISTERED`, `UNREGISTERED`, `ONLINE`, `OFFLINE`, `BUSY`):

```text
[Created]
   → PROVISIONING (await cfg + first REGISTER)
   → REGISTERED / ONLINE (Kamailio sync)
   ↔ OFFLINE / UNREGISTERED (expiry / network)
   → BUSY (optional presence overlay; Call Engine may drive)
   → Soft-deleted / revoked (credentials invalidated)
```

Provisioning ops may track finer substates in **ops store** (`render_pending`, `artifact_ready`, `cfg_downloaded`, `awaiting_register`) without expanding Prisma enums in this sprint.

### 9.2 Re-provisioning

| Trigger | Flow |
|---------|------|
| Admin Reprovision | Mark artifact stale → render → device next check / forced reboot instruct |
| Assignment change | Close/open `DeviceAssignment` → new SIP if Line changes → invalidate old artifact |
| Policy/template change | Batch enqueue by cohort; canary first |
| Secret rotation | Render + short dual-auth grace on Kamailio if needed |
| Firmware pin | Update firmware URL; devices poll |

### 9.3 Inventory synchronization

| Signal | Direction | Effect |
|--------|-----------|--------|
| Admin CRUD / CSV import | In → Device | Inventory |
| Provisioning check-in headers (UA, version) | Device → NestJS | Update reported firmware / model ops fields |
| Kamailio register event | Telecom → NestJS | `lastRegisteredAt`, status |
| Periodic reconcile job | NestJS ↔ location snapshot | Flag zombie Devices |

Reported firmware / user-agent strings live in ops inventory sync — **not** as SIP Call-ID or contact URI in Prisma.

### 9.4 Decommission

1. Soft-delete Device; close DeviceAssignment.  
2. Revoke SIP secret; delete/ban location.  
3. Delete/expire published artifacts.  
4. Keep audit trail indefinitely per compliance policy.

---

## 10. Versioning & Rollback Strategy

| Axis | Versioned? | Rollback |
|------|------------|----------|
| Template | Yes (immutable versions) | Pin Device/Tenant to prior template version; re-render |
| Rendered artifact | Content hash + provenance (templateVer, lineVer, secretGen) | Re-publish previous hash |
| Firmware catalog | Yes | Re-pin channel; force check |
| Device.business `version` | Optimistic concurrency on Domain writes | Conflict retry on admin APIs |

**Rollback never** rewrites history of `DeviceAssignment`; it issues a new render + optional assignment note.

Promotion pipeline: `draft → canary (Site) → tenant stable → platform default`.

---

## 11. Observability Architecture

### 11.1 Provisioning logs

Structured logs (tenantId, deviceId, mac, templateVer, artifactHash, outcome, latency, edge node):

- Auth success/fail  
- Render start/complete/fail  
- Artifact GET (bytes, cache hit)  
- Firmware GET  
- Quarantine hits  

### 11.2 Audit trail

Immutable business audits for:

- Device create / assign / reassign / delete  
- Credential rotate  
- Template promote / pin  
- Mass reprovision jobs  
- Tenant ownership transfer of MAC  

Correlate with ADR-014 domain events (`DeviceAssigned` + proposed provisioning events).

### 11.3 Device status

Admin dashboards:

- % PROVISIONING vs REGISTERED  
- Last provision / last register age  
- Firmware compliance vs pin  
- Failed pull counts  

### 11.4 Health monitoring

| Check | Owner |
|-------|-------|
| Provisioning Server TLS + origin health | Edge / SRE |
| Artifact store availability | SRE |
| Render queue depth / age | NestJS metrics |
| Register success rate post-provision cohort | Kamailio + NestJS |
| Cert expiry for `prov.*` | PKI monitors |

Alerts: spike in 401s, unknown MAC floods, render failure ratio, cohort register cliff after template promote.

---

## 12. Risks & Trade-offs

| Risk | Trade-off | Mitigation |
|------|-----------|------------|
| Open auto-enroll of unknown MAC | Convenience vs takeover | Default quarantine; claim workflow |
| Secrets in rendered cfg at rest | Phone must receive secrets | Vault + HTTPS + short artifact TTL + rotate |
| Grandstream model sprawl | Template matrix grows | Family-based templates; QA matrix |
| Mass firmware brick risk | Feature lag vs stability | Catalog pin + canary + rollback pin |
| RPS vendor dependency | True zero-touch | Keep DHCP / manual path as fallback |
| Dual MAC uniqueness (ADR vs Prisma tenant unique) | Rare HW reuse | ADR-042 clarifies enforcement |
| Config drift if phone local UI used | Ops confusion | Lock UI; periodic reclaim reprovision |
| Coupling recording/call policy into phone | Wrong enforcement point | Server-side authority; phone hints only |
| Provisioning vs SIP confusion in outages | Slow RCA | Strict plane separation + dual dashboards |

---

## 13. Recommended ADRs

| ADR | Title | Purpose |
|-----|-------|---------|
| **ADR-042** | Provisioning Edge & URL Scheme | HTTPS path layout, RPS contract, MAC auth scheme |
| **ADR-043** | SIP Credential & Secret Storage | Vault/HA1; rotation; no Prisma passwords |
| **ADR-044** | Provisioning Template & Artifact Store | Versioning, content hash, promotion pipeline |
| **ADR-045** | Firmware Catalog & Channels | Pinning, canary, mirroring policy |
| **ADR-046** | Device Provisioning Events | Extend ADR-014 (`DeviceProvisioned`, `DeviceReprovisionRequested`, …) |
| **ADR-025** | SIP Identity & Realm | Desk-phone AoR format (shared with Kamailio / WebRTC) |
| **ADR-047** | Provisioning Quarantine & MAC Claim | Unknown MAC handling; transfer between tenants |
| **ADR-048** | Desk Phone TLS & SRTP Profile | Align phone crypto with Kamailio/RTPengine policy |

Do not implement fleet provisioning until **ADR-042**, **ADR-043**, and **ADR-044** are Accepted.

---

## 14. Enterprise Readiness Assessment

| Dimension | Score (0–10) | Notes |
|-----------|--------------|-------|
| Fit with ADR-011 | 9.5 | Direct elaboration, not redesign |
| Fit with frozen Telephony | 9.5 | Device / Assignment / Line / SIPEndpoint |
| Separation from SIP/media | 9.5 | Clear planes vs Kamailio / RTPengine |
| Security posture | 9 | HTTPS + vault + quarantine default |
| Zero-touch readiness | 8.5 | RPS + DHCP + staged; ADR-042 needed |
| Multi-tenant isolation | 9 | MAC/Tenant binding + edge authZ |
| Scale (thousands of devices) | 8.5 | CDN artifacts + async render |
| Firmware ops maturity | 8 | Catalog/canary; scheduling future |
| Observability | 8.5 | Logs, audit, status, health defined |
| Ops complexity | 8 | Template matrix + RPS ops |
| **Overall design readiness** | **8.9** | Ready to freeze Sprint 4.5 |

---

## 15. Final Architecture Recommendation

**Adopt this Grandstream provisioning architecture as the Sprint 4.5 baseline.**

### Lock these decisions

1. Grandstream GRP/GXP are managed **DESK_PHONE** Devices; SIP registration is **post-provision** to Kamailio only.  
2. NestJS owns provisioning orchestration; Provisioning Server owns HTTPS delivery; Kamailio/RTPengine never serve cfg.  
3. Enrollment uses existing **`Device` + `DeviceAssignment` + `SIPEndpoint`**; no Prisma redesign.  
4. Zero-touch via RPS/DHCP/staged URL → authenticated HTTPS pull.  
5. Unknown MAC defaults to **quarantine**, not open auto-join.  
6. Templates versioned; artifacts content-addressed; secrets from vault.  
7. Firmware via curated catalog + tenant/site channels + canary.  
8. Multi-tenant isolation on every resolve and artifact fetch.  
9. Re-provision on assignment / policy / template / secret / firmware pin changes.  
10. RecordingPolicy / CallPolicy enforced server-side; phones get edge hints only.  
11. No device runtime SIP state in business schema.  
12. No redesign of Identity, Telephony, Call Engine, Kamailio, RTPengine, Telnyx, or WebRTC architectures.

### Implementation sequence (after ADRs)

1. Accept ADR-042 / 043 / 044.  
2. Provisioning HTTPS edge + MAC auth.  
3. Device inventori + Assignment APIs wiring to render queue.  
4. GRP/GXP base templates + generator.  
5. First-device smoke: cfg pull → REGISTER → call via RTPengine.  
6. Reassign + secret rotate + template rollback drills.  
7. Firmware catalog + canary.  
8. RPS / DHCP zero-touch for pilots.  
9. Fleet metrics + quarantine workflows.  

### Non-goals for Sprint 4.5

- Yealink / Fanvil / Poly templates  
- BLF / SLA / firmware scheduling / auto backup ([ADR-011](../ADR/ADR-011-grandstream-provisioning.md) future)  
- Writing XML templates or Docker in this design sprint  
- Storing SIP contacts / Call-IDs in Prisma  
- Moving recording or route logic onto the handset  

---

## Related Documents

| Document | Role |
|----------|------|
| [ADR-011 Grandstream Provisioning](../ADR/ADR-011-grandstream-provisioning.md) | Approved provisioning decisions |
| [ADR-002 / ADR-003](../ADR/ADR-002-tenant-domain-model.md) | Device / Line / Tenant rules |
| [TEL-KAM-002](./kamailio-telecom-integration-architecture.md) | Post-provision SIP |
| [TEL-RTP-001](./rtpengine-architecture.md) | Call media only |
| [TEL-WRTC-001](./webrtc-signaling-architecture.md) | Softphone contrast (enroll vs XML) |
| [ADR-014](../ADR/ADR-014-event-driven-architecture.md) | `DeviceAssigned` and domain events |
| [ADR-017](../ADR/ADR-017-disaster-recovery.md) | Provisioning data backup |
| Grandstream GRP/GXP Security & Firmware Upgrade manuals | Vendor HTTPS / cert / auth practices |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-08 | Sprint 4.5 Grandstream provisioning architecture |
