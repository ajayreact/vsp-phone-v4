# Phase 11 — Grandstream Provisioning Integration (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P11-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 11 Complete (static validation PASS; physical phone e2e pending) |
| **Date** | 2026-07-08 |
| **Scope** | Sprint 5 Wave 4 — Grandstream HTTPS provisioning (TEL-PROV-001) |
| **Architecture** | ADR-011 / ADR-042 / ADR-043 / ADR-044 — frozen |
| **Constraint** | Phases 1–10 / Prisma / Kamailio SIP signaling frozen |

---

## 1. Provisioning architecture summary

```text
Admin (JWT)                    Factory GRP/GXP Phone
     │                                │
     │ POST /v1/provisioning/...      │ HTTPS GET /gs/{mac}/cfg.xml
     ▼                                ▼
NestJS Provisioning Module      Prov Edge (PROV_HTTPS_PORT :3444)
     │                                │
     ├─ DeviceEnrollmentService       ├─ ProvMacAuthGuard (Basic)
     ├─ ProvisioningOrchestrator      ├─ ArtifactStoreService
     ├─ ConfigGeneratorService        └─ FirmwareCatalogService
     ├─ ProvisioningVaultService
     └─ ProvisioningAuditService
            │
            ├─ Prisma: Device, DeviceAssignment, SIPEndpoint (metadata only)
            ├─ Redis: MAC index, quarantine, artifact history, audit stream
            └─ Vault: desk SIP digest, prov HTTP creds, admin password
            │
            ▼ (post-provision — unchanged Phase 6 path)
       Kamailio REGISTER → RTPengine (calls)
```

| Component | Owner | Phase 11 |
|-----------|-------|----------|
| HTTPS config/firmware delivery | Prov edge (`ProvEdgeModule`) | ADR-042 canonical paths |
| Enrollment & line assignment | `DeviceEnrollmentService` | Prisma + vault |
| Config render & versioning | `ConfigGeneratorService` + orchestrator | Content-addressed artifacts |
| Secrets | `ProvisioningVaultService` + `SipCredentialVaultService` | ADR-043; no secrets in Prisma |
| Unknown MAC | Quarantine + 401/404 | Redis `vsp:prov:quarantine:{mac}` |
| SIP runtime | Kamailio Redis location | **Not** stored in Prisma |
| Multi-tenant isolation | Tenant-scoped Prisma queries + global MAC uniqueness | App-layer MAC index |

**Dual listeners:** Main API (`PORT` / `api` prefix) serves admin + internal routes; provisioning edge listens on `PROV_HTTPS_PORT` with no global prefix.

**Not implemented:** BLF, presence, SLA, queue/conference/IVR/recording/AI features.

---

## 2. Configuration generation summary

| Item | Implementation |
|------|----------------|
| Template engine | `TemplateEngineService` — Grandstream XML (`gs_provisioning`), platform template version `1.0.0` |
| Versioning | Monotonic `configVersion` in Redis device meta; history list for rollback |
| Artifact hash | SHA-256 over sorted `{mac, configVersion, templateVersion, aor, …}` → 32-char hex |
| Object key | `prov/{tenantId}/gs/{mac}/{artifactHash}.xml` (ADR-044) |
| Per-tenant templates | Tenant `settings.timezone` / `defaultLanguage` injected into render context |
| Per-site overrides | Optional `siteId` stored in Redis meta for future template profile selection |
| Secure prov URL | `PROV_PUBLIC_BASE_URL/gs/{mac}/cfg.xml` embedded in generated XML (`P237`) |
| SIP parameters | AoR, auth username, desk SIP password from vault; registrar from `SIP_REGISTRAR_HOST` or realm |
| TLS validate flag | `PROV_TLS_VALIDATE` → Grandstream `P212` |

Internal render trigger: `POST /api/v1/internal/provisioning/render` `{ deviceId }` → `{ artifactHash, configVersion, objectKey }`.

---

## 3. Device enrollment summary

### Admin enroll (JWT)

`POST /api/v1/provisioning/devices/enroll`

```json
{
  "mac": "00:0b:82:0a:12:34",
  "name": "Front Desk GRP2612",
  "lineId": "<uuid>",
  "modelFamily": "grp261x",
  "siteId": "<optional-uuid>",
  "firmwareChannel": "stable"
}
```

**Flow:**

1. Normalize MAC (12 hex digits); reject duplicates (global MAC index + Prisma).
2. Create `SIPEndpoint` (AoR = `sip:{extension}@{tenant.slug}.sip.{domain}`).
3. Create `Device` (`DESK_PHONE`, status `PROVISIONING`, MAC stored).
4. Create active `DeviceAssignment` (user + line from Line record).
5. Issue vault secrets: persistent desk SIP digest, prov HTTP Basic, admin password.
6. Render config v1 → artifact store; index MAC in Redis.
7. Audit `provisioning.enrolled`.

**Additional admin APIs:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/provisioning/devices/:deviceId/assign` | Line reassignment + assignment history |
| POST | `/v1/provisioning/devices/reprovision` | Bump config version + re-render |
| POST | `/v1/provisioning/devices/rollback` | Restore artifact from version history |

**Factory reset recovery:** Phone re-pulls same prov URL; credentials remain in vault until admin revokes/re-enrolls.

---

## 4. Firmware management summary

| Item | Detail |
|------|--------|
| Catalog | `FirmwareCatalogService` — curated channels: `stable`, `n-1`, `emergency` |
| Default versions | Env: `PROV_FIRMWARE_STABLE_VERSION`, `PROV_FIRMWARE_N1_VERSION`, `PROV_FIRMWARE_EMERGENCY_VERSION` |
| Model families | `grp261x`, `gxp21xx` (extensible) |
| Edge URL | `GET /fw/{modelFamily}/{version}/{filename}` (catalog-gated) |
| Config reference | Generated XML `P192` points to approved firmware URL on prov host |
| Channel selection | Per-device `firmwareChannel` in Redis meta; defaults to `stable` at enroll |
| Binary staging | `{PROV_ARTIFACT_ROOT}/fw/{modelFamily}/{version}/{filename}` (ops responsibility) |

Firmware download does not require MAC auth (catalog version gate only); config download requires per-device Basic auth.

---

## 5. Validation report

| Check | Command / criterion | Result |
|-------|---------------------|--------|
| Phase 11 gate | `npm run telecom:validate:phase11` | **PASS** |
| API build | via phase11 gate | **PASS** |
| Phase 10 regression | via phase11 gate | **PASS** |
| Prisma frozen | no `schema.prisma` diff | **PASS** |
| Kamailio unchanged | Phase 9 `rtpengine_offer` intact | **PASS** |
| Known device provisions | enroll → render → edge GET with Basic auth | Static OK; runtime needs DB seed + TLS |
| Unknown MAC quarantine | `ProvMacAuthGuard` + Redis quarantine key | **PASS** (code path) |
| Config version increment | `reprovision` bumps `configVersion` | **PASS** (code path) |
| HTTPS provisioning | `PROV_HTTPS_PORT` + `TLS_PROV_*` | **PASS** (bootstrap wired) |
| Configuration rollback | `rollback` restores history entry | **PASS** (code path) |
| Firmware channel | enroll `firmwareChannel` → catalog resolve | **PASS** (code path) |
| DeviceAssignment mapping | Prisma transaction on enroll/assign | **PASS** |
| Device registers after provision | Uses existing Phase 6 REGISTER (unchanged) | Static OK; e2e pending |
| Audit logs | `ProvisioningAuditService` → logger + Redis stream | **PASS** |
| No SIP runtime in Prisma | contacts/Call-ID remain in Kamailio Redis only | **PASS** |

```bash
npm run telecom:validate:phase11
# Lab (after DB seed with Line + Extension):
# 1. POST /api/v1/auth/login
# 2. POST /api/v1/provisioning/devices/enroll
# 3. curl -u {mac}:{provPassword} https://prov.localhost:3444/gs/{mac}/cfg.xml
# 4. Phone REGISTER to Kamailio with provisioned digest
```

---

## 6. Phase 11 completion statement

Phase 11 delivers the **approved Grandstream provisioning system** on top of frozen Phases 1–10:

- HTTPS provisioning edge with ADR-042 canonical URLs and MAC-bound Basic auth
- Zero-touch enrollment: MAC → Device → DeviceAssignment → SIPEndpoint → vault secrets → versioned XML artifact
- Configuration versioning, reprovision, and rollback via Redis artifact history
- Firmware channel catalog with prov-edge delivery path
- Multi-tenant isolation with global MAC uniqueness and quarantine for unknown devices
- Audit events for enroll, render, download, quarantine, reprovision, rollback, status sync
- Device status synchronization via existing registration event bus (no SIP signaling changes)

**Stop boundary:** Phase 12+ not started (queue, conference, IVR, recording, AI, BLF, presence, SLA).

---

## Files touched (Phase 11 only)

| Area | Files |
|------|-------|
| Provisioning core | `apps/api/src/modules/provisioning/**` |
| Prov edge bootstrap | `apps/api/src/prov/prov-edge.bootstrap.ts` |
| Vault extension | `apps/api/src/modules/telecom/auth/sip-credential-vault.service.ts` (`registerPersistentCredential`) |
| App wiring | `apps/api/src/app/app.module.ts`, `main.ts`, `tls.options.ts`, `env.validation.ts` |
| Telecom export | `apps/api/src/modules/telecom/module.ts` (export shared vault) |
| Config | `.env.example`, `package.json`, `Makefile` |
| Validation | `scripts/telecom/validate-phase11.cjs` |

**Frozen (not modified):** `prisma/schema.prisma`, Kamailio SIP cfg, Phase 6–10 telecom signaling paths.
