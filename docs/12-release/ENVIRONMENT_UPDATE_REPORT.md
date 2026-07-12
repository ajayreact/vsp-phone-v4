# Environment Update Report — VSP Phone v4 RC1

> **Updated:** Environment templates consolidated. Use [`.env.production.template`](../../.env.production.template), [`.env.optional.template`](../../.env.optional.template), and [ENVIRONMENT.md](../07-deployment/ENVIRONMENT.md) as the canonical reference going forward.

| Field | Value |
|-------|-------|
| **Date** | 2026-07-09 |
| **Server** | `vsp-voip-app-01` (`172.31.39.116`) |
| **Project path** | `/opt/vsp-phone-v4` |
| **Legacy app** | `/opt/vsp-voip-backup` (unchanged) |
| **Operator** | Release Engineer / DevOps |
| **Scope** | `.env` configuration only — no code, schema, or deployment |

---

## Summary

VSP Phone v4 is reconfigured to use a **new PostgreSQL database** (`vsp_phone_v4`). The legacy production database **`vsp_voip` remains untouched** and continues to serve the legacy VSP VoIP application.

---

## Database configuration

| Item | Previous | New |
|------|----------|-----|
| **Application database** | `vsp_voip` (legacy) | `vsp_phone_v4` (v4) |
| **Legacy database status** | In use by v3 | **Untouched — not referenced by v4 `.env`** |
| **`POSTGRES_DB`** | `vsp_voip` | `vsp_phone_v4` |
| **`DATABASE_URL`** | `postgresql://vsp:vsp@127.0.0.1:5432/vsp_voip?schema=public` | `postgresql://vsp:vsp@localhost:5432/vsp_phone_v4?schema=public` |

**Note:** `KAMAILIO_USRLOC_DB_URL` remains pointed at the separate `kamailio` database (`postgresql://vsp:vsp@postgres:5432/kamailio?schema=public`). This is intentional — Kamailio usrloc persistence is not the v4 application database.

---

## Runtime profile

| Variable | Previous | New |
|----------|----------|-----|
| **`NODE_ENV`** | `production` | `production` (unchanged) |
| **`VSP_ENV`** | `development` | `production` |

---

## Variables updated (diff from prior server `.env`)

Only these three values were changed per release instructions:

| Variable | Before | After |
|----------|--------|-------|
| `POSTGRES_DB` | `vsp_voip` | `vsp_phone_v4` |
| `DATABASE_URL` | `postgresql://vsp:vsp@127.0.0.1:5432/vsp_voip?schema=public` | `postgresql://vsp:vsp@localhost:5432/vsp_phone_v4?schema=public` |
| `VSP_ENV` | `development` | `production` |

All other variables were **preserved** from the prior EC2 `.env` (secrets, URLs, Kamailio, RTPengine, etc.).

---

## Production requirement verification

Checked against `apps/api/src/app/env.validation.ts` and `docs/11-final-audit/FINAL_DEPLOYMENT_CHECKLIST.md`:

| Variable | Present | Value / status |
|----------|---------|----------------|
| `JWT_SECRET` | ✅ Yes | Set (64-char hex — preserved from prior `.env`) |
| `TELECOM_SERVICE_AUTH_TOKEN` | ✅ Yes | Set (preserved from prior `.env`) |
| `TELNYX_WEBHOOK_SECRET` | ⚠️ Placeholder | `REPLACE_WITH_TELNYX_WEBHOOK_SECRET` — **operator must replace** |
| `TLS_ENABLED` | ✅ Yes | `false` — **blocks API startup when `VSP_ENV=production`** (see below) |
| `DATABASE_URL` | ✅ Yes | Points to `vsp_phone_v4` |
| `REDIS_URL` | ✅ Yes | `redis://localhost:6379` |
| `BACKUP_LOCATION` | ✅ Yes | `/opt/vsp-phone-v4/backups` |
| `SECURITY_ENFORCE_TELECOM` | ✅ Yes | `true` |

### Verification result

| Check | Result |
|-------|--------|
| Legacy DB decoupled | ✅ PASS — no `vsp_voip` reference in `DATABASE_URL` / `POSTGRES_DB` |
| Production profile set | ✅ PASS — `VSP_ENV=production` |
| Secrets present (JWT, telecom auth) | ✅ PASS |
| Ready to start API without operator action | ❌ **BLOCKED** — see operator input below |

---

## Variables still requiring operator input

Before starting the v4 API with `VSP_ENV=production`, the operator must complete:

| Priority | Variable | Issue | Action |
|----------|----------|-------|--------|
| **Critical** | `TELNYX_WEBHOOK_SECRET` | Placeholder value | Set from Telnyx portal webhook signing secret |
| **Critical** | `TLS_ENABLED` | `false` fails `assertProductionSecurity()` | Set `TLS_ENABLED=true` |
| **Critical** | `TLS_ENV` + cert paths | Still `development/live` dev certs | Provision production TLS under `infrastructure/tls/production/live/` and update paths |
| **High** | Database `vsp_phone_v4` | Not created by this task | Operator creates DB and applies v4 Prisma schema (separate step) |
| **Recommended** | `MIGRATION_DEV_SUPER_ADMIN` | Still `true` | Set `false` before production cutover |
| **Recommended** | `MIGRATION_REQUIRE_READINESS` | Still `false` | Set `true` before migration/cutover window |
| **Recommended** | `READINESS_STRICT` | Still `false` | Set `true` for production HA reporting |

No values were invented for missing secrets.

---

## Explicitly not performed (per instructions)

- [ ] Database creation (`vsp_phone_v4`)
- [ ] Prisma generate / migrate / db push
- [ ] Application or Docker stack start
- [ ] Code, schema, Kamailio, RTPengine, or telecom API changes

---

## Backup

Prior `.env` should be saved on the server as:

```text
/opt/vsp-phone-v4/.env.backup-YYYY-MM-DD-HHMM
```

---

## Related documents

- [FINAL_DEPLOYMENT_CHECKLIST.md](../11-final-audit/FINAL_DEPLOYMENT_CHECKLIST.md)
- [RELEASE_NOTES_v4.0.0_RC1.md](./RELEASE_NOTES_v4.0.0_RC1.md)
- [production-runbook.md](../10-production/production-runbook.md)
