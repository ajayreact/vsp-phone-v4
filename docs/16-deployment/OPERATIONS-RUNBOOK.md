# VSP Phone 5 — Operations Runbook (RC1)

| Field | Value |
|-------|-------|
| Audience | SRE / Platform / Telecom on-call |
| Scope | Staging certification → Customer Pilot → GA |
| Related | [RC1-EXIT-CRITERIA.md](./RC1-EXIT-CRITERIA.md) · [ROLLBACK.md](./ROLLBACK.md) |

---

## 1. Daily health

| Check | Command / URL | Expect |
|-------|---------------|--------|
| API liveness | `GET /api/health` | 200 |
| API readiness | `GET /api/ready` | 200 (Postgres + Redis) |
| Postgres | `GET /api/health/postgres` | up |
| Redis | `GET /api/health/redis` | up |
| Kamailio | `GET /api/health/kamailio` | up |
| RTPengine | `GET /api/health/rtpengine` | up |
| Admin | `GET https://admin…/api/health` | 200 |

---

## 2. Staging certification sequence

**Authority:** [RC1-GOVERNANCE.md](./RC1-GOVERNANCE.md). Run **in order** on staging. Do not skip steps.

```bash
npm run platform:ensure-inventory
npx prisma migrate deploy
npm run platform:rc1-infra
RC1_PROFILE=production npm run platform:rc1-env
API_BASE=https://api.<staging>/api \
PLATFORM_EMAIL=... PLATFORM_PASSWORD=... \
npm run platform:pilot-smoke

# Execute live PBX call laboratory → sign RC1-CALL-LAB-REPORT.md

CALL_LAB_RESULT=PASS npm run platform:rc1-validate
```

### On failure

1. Stop promotion.  
2. Generate a defect report ([template](./RC1-GOVERNANCE.md#5-defect-report-template-promotion-failure)).  
3. Fix **only** the blocking issue (Allowed categories only).  
4. **Restart from `platform:ensure-inventory`.**  

Exit code **0** with classification **RC Approved for Customer Pilot** is required before first live customer.

---

## 3. Incident response (short)

| Symptom | First actions |
|---------|----------------|
| Portal login failures | Check JWT_SECRET, Redis, `/api/ready`, auth rate limits |
| No REGISTER | Kamailio logs, `TELECOM_SERVICE_AUTH_TOKEN`, usrloc, SIP domain |
| One-way audio | RTPengine advertise/NAT, firewall RTP range |
| DID assign fails | Inventory tenant id, Telnyx key, `platform:rc1-infra` |
| MAC already enrolled | Confirm device soft-delete cleared MAC; Redis `vsp:prov:mac:*` |
| Cross-tenant leak suspicion | Freeze traffic; pull audit logs; verify portal JWT + tenantId |

Escalate to rollback if health/ready remains red >5 minutes or PSTN broken for all tenants — see [ROLLBACK.md](./ROLLBACK.md).

---

## 4. Backups & restore

1. Daily automated `pg_dump` of `vsp_phone_v4` to `BACKUP_LOCATION`
2. Pre-deploy dump before every migrate
3. Quarterly restore drill to a scratch DB
4. Redis is ephemeral — rebuild MAC index via re-enroll after restore

---

## 5. Preprod hygiene

Before each pilot wave:

```bash
node scripts/platform/preprod-cleanup.cjs --dry-run --sql-only
# review, then
node scripts/platform/preprod-cleanup.cjs --confirm --sql-only
```

Never delete Platform / VSP INTERNAL / Platform Inventory tenants.

---

## 6. Monitoring & alerts (minimum)

| Signal | Severity |
|--------|----------|
| `/api/ready` down | P1 |
| API 5xx sustained | P1 |
| Kamailio REGISTER fail rate spike | P1 |
| Telnyx assign/purchase errors | P2 |
| Redis down | P1 |
| Disk backups / recordings >80% | P2 |
| Impersonation anomalies (volume) | P2 |

---

## 7. GA soak

After Customer Pilot:

1. Track all Sev-1/Sev-2 defects for **14 consecutive days** with zero critical/high open
2. Set `RC1_SOAK_14_DAYS=PASS`
3. Confirm load report meets agreed SLOs
4. Re-run `npm run platform:rc1-validate` → **RC Approved for General Availability**
