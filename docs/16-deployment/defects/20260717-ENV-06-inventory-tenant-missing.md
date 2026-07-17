# Defect — ENV-06

| Field | Value |
|-------|-------|
| ID | **ENV-06** |
| Severity | **P0** |
| Status | **Open — confirmed by smoke** |
| Target | AWS `https://api.vspphone.com/api` |

## Confirmed evidence (`platform:pilot-smoke`)

| Check | Result | Detail |
|-------|--------|--------|
| Platform — Login | PASS | HTTP 201 |
| B2 Inventory — inventoryTenantId configured | **FAIL** | `missing` |
| Numbers — Inventory available | **FAIL** | `available=0` |
| Extensions — Auto-created 100/101/102 | **FAIL** | `found=` (cascade) |

Other smoke checks (onboarding, users, isolation, impersonation, CDR/recording/VM APIs) **PASS**. Cleanup soft-deleted the pilot tenant successfully.

## Root cause (most likely)

Same class as **ENV-03**: host-side Prisma scripts can hit the wrong DB / leave `platform_settings.inventory_tenant_id` null in the **API** database.

Smoke reads **only** `GET /v1/platform/settings` → `inventoryTenantId`.  
Env fallback `VSP_PLATFORM_INVENTORY_TENANT_ID` is **not** enough for that check (and may also be missing from the API container).

`available=0` is a second gate: inventory tenant must be wired **and** Telnyx inventory must have ≥3 `available` numbers (sync / purchase). Extension 100/101/102 fails until three DIDs are assigned.

## Minimum recovery (operator on EC2)

```bash
cd /opt/vsp-phone-v4
source scripts/platform/ec2-compose-env.sh

# 1) Wire inventory tenant in the API database (not host localhost)
$COMPOSE run --rm --no-deps api node scripts/platform/ensure-platform-inventory-tenant.cjs
```

Expect JSON with `"ok": true` and an `inventoryTenantId`. Then:

```bash
INV_ID='<paste inventoryTenantId from above>'

# 2) Persist env (single line; dedupe if needed)
grep -q '^VSP_PLATFORM_INVENTORY_TENANT_ID=' .env \
  && sed -i "s|^VSP_PLATFORM_INVENTORY_TENANT_ID=.*|VSP_PLATFORM_INVENTORY_TENANT_ID=${INV_ID}|" .env \
  || echo "VSP_PLATFORM_INVENTORY_TENANT_ID=${INV_ID}" >> .env

# 3) Recreate API so process env picks it up
$COMPOSE up -d --force-recreate --no-deps api
$COMPOSE ps api
```

### Verify settings

```bash
PASS='YOUR_PLATFORM_PASSWORD'
TOKEN=$(python3 - <<'PY'
import json, os, urllib.request
body = json.dumps({
  "email": "admin@vspphone.com",
  "password": os.environ["PASS"],
  "portal": "platform",
}).encode()
req = urllib.request.Request(
  "https://api.vspphone.com/api/v1/auth/login",
  data=body,
  headers={"Content-Type": "application/json"},
  method="POST",
)
with urllib.request.urlopen(req) as r:
  print(json.load(r)["accessToken"])
PY
)

curl -sS "https://api.vspphone.com/api/v1/platform/settings" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool | head -40
```

Expect `"inventoryTenantId": "<uuid>"` (not null).

### Sync / confirm DID inventory (≥3 available)

```bash
curl -sS -X POST "https://api.vspphone.com/api/v1/carriers/telnyx/numbers/sync" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool | head -40

curl -sS "https://api.vspphone.com/api/v1/carriers/telnyx/numbers?limit=50" \
  -H "Authorization: Bearer ${TOKEN}" | python3 - <<'PY'
import json,sys
rows=json.load(sys.stdin)
if isinstance(rows, dict):
  rows=rows.get("items") or rows.get("data") or rows.get("numbers") or []
avail=[n for n in rows if str(n.get("status","")).lower()=="available"]
print("total", len(rows), "available", len(avail))
for n in avail[:5]:
  print(n.get("id"), n.get("number") or n.get("phoneNumber"))
PY
```

If `available < 3`: purchase/tag inventory DIDs in platform admin (Telnyx) until ≥3 are available, then re-check.

### Re-run smoke

```bash
API_BASE=https://api.vspphone.com/api \
PLATFORM_EMAIL=admin@vspphone.com \
PLATFORM_PASSWORD='YOUR_PLATFORM_PASSWORD' \
npm run platform:pilot-smoke
```

Expect B2 Inventory, Numbers, and Extensions checks to **PASS** (or Numbers SKIP only if intentionally `SKIP_TELNYX=1` — not for RC1 cert).

## Classification impact

**RC Approved for Internal Testing** until ENV-06 closed and smoke green.  
Do **not** proceed to Customer Pilot / call-lab sign-off while inventory/DID gates fail.
