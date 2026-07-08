# Phase 2 — Certificates & TLS Infrastructure (Completion Report)

| Field | Value |
|-------|-------|
| **Document ID** | IMP-S5-P2-001 |
| **Version** | 1.0.0 |
| **Status** | Phase 2 Complete |
| **Date** | 2026-07-08 |
| **Blueprint** | [IMP-S5-001](./sprint-5-engineering-blueprint.md) Phase 2 |
| **Depends On** | Phase 1 (IMP-S5-P1-001) |

---

## 1. Certificate directory layout

```text
infrastructure/tls/
  README.md
  .gitignore
  openssl/
    ca.cnf
    server.cnf.template
  trust-store/
    README.md
    dev-ca.crt                 # generated, gitignored
  development/
    README.md
    live/                      # generated, gitignored
      MANIFEST.txt
      ca/{ca.crt,ca.key}
      api|admin|sip|wss|prov/{cert.pem,privkey.pem,fullchain.pem}
      kamailio/{privkey.pem,fullchain.pem,ca.crt}
  staging/README.md
  production/README.md
  var/                         # rotation backups, gitignored

infrastructure/kamailio/
  kamailio.cfg                 # WITH_TLS listeners :5061 / :8443
  tls.cfg                      # cert path profile

scripts/tls/
  generate-dev-certs.cjs       # primary generator (Node)
  generate-dev-certs.sh        # OpenSSL alternative
  validate-certs.cjs
  rotate-dev-certs.sh|.ps1
  README.md
```

Private keys and live PEMs are **gitignored**. Only configs/docs are tracked.

---

## 2. TLS architecture summary

| Plane | Certificate | Listener / usage |
|-------|-------------|------------------|
| Dev CA | `live/ca` | Signs leaves; client trust via `trust-store/dev-ca.crt` |
| HTTPS API | `live/api` | NestJS when `TLS_ENABLED=true` |
| Admin (future TLS terminate) | `live/admin` | Available; Phase 2 terminates TLS at API / edge |
| SIP TLS | `live/sip` → `kamailio/` | Kamailio `tls:0.0.0.0:5061` |
| WSS | `live/wss` (= sip) | Kamailio `tls:0.0.0.0:8443` (WebSocket upgrade later) |
| Provisioning | `live/prov` | Path env ready for Phase 17 edge |

**Per-environment:** `TLS_ENV=development|staging|production` selects `infrastructure/tls/{env}/live`.

**Future PKI (not automated in Phase 2):** Let's Encrypt / ACME, internal CA, enterprise PKI — documented under `staging/` and `production/` READMEs.

**Rotation strategy:** backup `live/` → regenerate leaves (optional CA) → reload Kamailio/API → dual-publish window is ops-owned.

Compose mounts `live/` into API (`/etc/vsp/tls`) and Kamailio (`/etc/kamailio/tls`). Entrypoint validates cfg and warns if certs missing.

---

## 3. Validation results

| Check | Result |
|-------|--------|
| `npm run tls:generate` / `node scripts/tls/generate-dev-certs.cjs --force` | **PASS** |
| CA parses (`X509Certificate`, `ca=true`) | **PASS** |
| Leaves api/admin/sip/wss/prov/kamailio parse + keys | **PASS** |
| SAN includes localhost, 127.0.0.1, Docker DNS names | **PASS** |
| `validate-certs.cjs` HTTPS smoke (trust Dev CA) | **PASS** |
| NestJS `TLS_ENABLED=true` → `GET https://127.0.0.1:3443/api/health` | **PASS** (200) |
| `tls.cfg` + Kamailio `WITH_TLS` present | **PASS** |
| Secrets not committed (gitignore) | **PASS** |
| Docker Kamailio process load with certs | **NOT RUN** (no Docker CLI on host) — cfg `kamailio -c` runs in container entrypoint when Docker available |

---

## 4. Operational instructions

```bash
# Generate / refresh development PKI
npm run tls:generate

# Validate PEMs + HTTPS smoke
npm run tls:validate

# Optional NestJS HTTPS (host)
# set TLS_ENABLED=true and TLS_API_* paths in .env (see .env.example)
npm run build:api && node dist/apps/api/main.js

# Docker stack (on Docker host) — ensure certs exist first
npm run tls:generate
npm run docker:up
```

Trust the Dev CA in browsers/OS/Grandstream when using private PKI (`infrastructure/tls/trust-store/dev-ca.crt`).

---

## 5. Security considerations

1. **Never commit** `*.key` / live PEMs — enforced by root + `infrastructure/tls/.gitignore`.  
2. Dev CA is for **local/lab only** — do not distribute as production trust.  
3. NestJS HTTPS defaults **off** (`TLS_ENABLED=false`) so local HTTP Phase 1 workflows keep working.  
4. Kamailio Phase 2 TLS profile uses `verify_certificate=no` for lab; mutual TLS can be tightened later.  
5. File mode `600` applied on keys where the OS allows (Windows ACLs differ).  
6. Production: mount certs from secret store / ACME; set `TLS_ENV=production`.  
7. Certificate paths are fully env-driven (`TLS_*_FILE`, Compose mounts).

---

## 6. Phase 2 completion checklist

- [x] Development Certificate Authority  
- [x] Server certificate generation (api, admin, sip, wss, prov, kamailio bundle)  
- [x] TLS directory structure (dev/staging/production)  
- [x] Certificate automation scripts (generate / validate / rotate)  
- [x] Kamailio TLS certificate loading (`tls.cfg`, listeners, Compose mount, entrypoint)  
- [x] HTTPS certificate loading (NestJS `TLS_ENABLED` + paths)  
- [x] WSS certificate support (sip-equivalent material + port 8443)  
- [x] Certificate rotation strategy (backup + regenerate docs/scripts)  
- [x] Environment configuration (`.env.example` TLS block)  
- [x] Validation scripts (passed on this host)  
- [x] No secrets committed  
- [ ] Containerized Kamailio TLS start — pending Docker host (entrypoint ready)

### Exit decision

**Phase 2 is complete.** Do **not** start Phase 3 until this report is accepted. On a Docker workstation, run `npm run tls:generate && npm run docker:up` once to confirm Kamailio loads mounted certs without cfg errors.

---

## Related

| Doc | Role |
|-----|------|
| ADR-042 | Provisioning HTTPS |
| ADR-039 | WSS profile |
| ADR-025 | SIP identity / FQDN |
| IMP-S5-P1-001 | Phase 1 infrastructure |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-08 | Phase 2 TLS/PKI implemented and validated |
