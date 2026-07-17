# Defect — ENV-05 (confirmed)

| Field | Value |
|-------|-------|
| ID | **ENV-05** |
| Severity | **P0** |
| Status | **CLOSED** — API redeployed; login with `portal:platform` → HTTP 201 |
| Target | AWS `https://api.vspphone.com/api` |

## Confirmed evidence

| Request body | HTTP | Detail |
|--------------|------|--------|
| `{ email, password, portal: "platform" }` | **400** | `VALIDATION_FAILED` — `"property portal should not exist"` |
| `{ email, password }` | **201** | Login succeeds (`accessToken` returned) |

## Root cause

The **running API container** was built from a revision whose `LoginRequestDto` does **not** allow `portal`.  
Smoke / current `release/v4.0.0-rc1` source **does** send `portal`.

Nest `forbidNonWhitelisted: true` → HTTP 400.

This is a **deploy skew**, not bad credentials.

## Why not “just remove portal from smoke”

On current (old) API, omitting `portal` works.  
On the **new** API (after redeploy), omitting `portal` defaults login to **tenant** portal → platform admin is **403**.

So the correct fix is **redeploy the API** from `release/v4.0.0-rc1`, then keep smoke as-is.

## Minimum recovery (operator on EC2)

```bash
cd /opt/vsp-phone-v4
git fetch origin
git checkout release/v4.0.0-rc1
git pull origin release/v4.0.0-rc1

source scripts/platform/ec2-compose-env.sh

# Rebuild/restart API (use your standard deploy script if preferred)
sudo bash scripts/platform/ec2-deploy-extension-first.sh
# OR:
# $COMPOSE build api && $COMPOSE up -d api
```

Verify portal is accepted:

```bash
curl -sS -o /tmp/login-a.json -w "HTTP %{http_code}\n" \
  -X POST https://api.vspphone.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@vspphone.com","password":"YOUR_PASSWORD","portal":"platform"}'
cat /tmp/login-a.json; echo
```

Expect **200/201** (not 400). Then:

```bash
API_BASE=https://api.vspphone.com/api \
PLATFORM_EMAIL=admin@vspphone.com \
PLATFORM_PASSWORD='YOUR_PASSWORD' \
npm run platform:pilot-smoke
```

## Security

Rotate the platform admin password if it appeared in shell history or chat.
