# Extension-First Deployment & Verification Status

**Updated:** 2026-07-11T16:35Z  
**Commit in bundle:** `c5290b65b9a36f973d6bc92330d356a37ad8d1eb` (+ uncommitted Extension-First files)  
**Production API (pre-deploy):** `hub/stats` → **404** (Extension-First API not live yet)  
**Git commit:** **NOT CREATED** (per instruction)

---

## Phase 1 — Deploy (ACTION REQUIRED ON EC2)

SSH from this workstation is **not available** (no private key). You chose to run deploy on EC2.

### Artifacts ready

| Item | Path |
|------|------|
| Deploy tarball | `E:\vsp-phone-v4\dist\vsp-extension-first-20260711-220452.tgz` |
| EC2 runbook | `static/runtime-verification/EC2_DEPLOY_RUNBOOK.md` |
| Deploy script | `scripts/platform/ec2-deploy-extension-first.sh` |
| Manifest | `static/runtime-verification/DEPLOY_MANIFEST.json` |

### Quick EC2 commands

```bash
# After scp tarball to /tmp/
cd /opt/vsp-phone-v4
cp .env /tmp/vsp-env-backup-$(date -u +%Y%m%dT%H%M%SZ)
sudo tar -xzf /tmp/vsp-extension-first-20260711-220452.tgz -C /opt/vsp-phone-v4
cp /tmp/vsp-env-backup-* .env
sudo bash scripts/platform/ec2-deploy-extension-first.sh
```

### Post-deploy must pass

| Endpoint | Expected |
|----------|----------|
| `GET /api/health` | 200 `{ "status": "ok" }` |
| `GET /api/ready` | 200 ready |
| `GET /api/v1/tenant/extensions/hub` | 200 (with tenant JWT) |
| `GET /api/v1/tenant/extensions/hub/stats` | 200 KPI object (with tenant JWT) |

Deployment log will be written to:  
`static/runtime-verification/deployment-*.log`

---

## Phases 2–9 — Verification (blocked until deploy completes)

Run after EC2 deploy:

```bash
export API_BASE="https://api.vspphone.com/api"
export PLATFORM_EMAIL="..."
export PLATFORM_PASSWORD="..."
node scripts/platform/verify-extension-first-runtime.cjs
```

Playwright UI (Phases 3–7):

```powershell
$env:BASE_URL="https://tenant.vspphone.com"
$env:TENANT_EMAIL="..."
$env:TENANT_PASSWORD="..."
cd apps\admin-e2e
npx playwright test src/extension-first-runtime.spec.ts -c playwright.local.config.mts
```

Phase 8 (call flow) requires Kamailio/RTPengine/WebRTC — run on EC2 lab after Phases 1–7 pass.

---

## Known label expectation vs implementation

Auto-provision sets line name to `Extension 101`.  
`formatExtensionLabel()` intentionally collapses that to **`101`** (not `101 • Extension 101`).

If verification requires `101 • Extension 101`, either:

- Change default display name to something other than `Extension {n}`, or  
- Adjust label helper (currently out of scope — no refactor requested)

Rename to **Reception** should produce **`101 • Reception`** everywhere.

---

## Screenshots (pre-deploy smoke only)

| File | Description |
|------|-------------|
| `static/runtime-verification/playwright/00-login-page.png` | Tenant login UI |
| `static/runtime-verification/playwright/00-extensions-guard.png` | Auth guard on `/extensions` |

Extension Hub screenshots require post-deploy authenticated session.

---

## Console / network (pre-deploy smoke)

| File | Result |
|------|--------|
| `playwright/smoke-console-errors.json` | `[]` |
| `playwright/smoke-failed-requests.json` | `[]` |
| `production-probe.json` | `hub/stats: 404` pre-deploy |

---

## Remaining issues

1. **Deploy not executed** — awaiting EC2 tarball extract + `ec2-deploy-extension-first.sh`
2. **Production API missing Extension-First routes** — confirmed `hub/stats` 404
3. **Auto-provision label** — shows `101` not `101 • Extension 101` until renamed
4. **Phase 8 call flow** — needs live SIP/media stack
5. **No git commit** — blocked until all phases pass

---

## Next step

Run EC2 deploy using the runbook, then reply **deploy done** with:

- Output tail of `deployment-*.log`
- `cat static/runtime-verification/deployed-commit.txt`
- Tenant admin email used for verification (or confirm onboard script created one)

Verification Phases 2–9 will run immediately after.
