# Rollback Plan — VSP Phone v4 RC1

| Field | Value |
|-------|-------|
| **Release** | `v4.0.0-rc1` (`824d619`) |
| **Trigger** | Failed deploy, health/ready outage, SIP/PSTN break, auth/RBAC regression, data integrity failure |
| **Related** | [AWS-DEPLOYMENT-CHECKLIST.md](./AWS-DEPLOYMENT-CHECKLIST.md), `docs/14-rc1/ROLLBACK-PLAN.md` |

RC1 is **schema-frozen**. Prefer application rollback. Restore PostgreSQL only if data corruption or a bad migration occurred.

---

## Decision criteria (initiate rollback)

Rollback immediately when any of:

1. `GET /api/health` or `GET /api/ready` fails for **> 5 minutes** after deploy
2. Admin/Tenant portals cannot authenticate (BFF/API auth broken)
3. SIP registration or PSTN inbound/outbound broken for the pilot path
4. Provisioning creates orphans / integrity SQL shows critical issues
5. Wrong database connected (`vsp_voip` / empty tenant count)
6. Operator judgment: pilot customers cannot place or receive calls

---

## T+0 — Stop the bleeding

```bash
ssh ubuntu@32.196.41.160
cd /opt/vsp-phone-v4

# Preserve evidence
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p static/runtime-verification/incidents
docker compose \
  -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.host-db.yml \
  --env-file .env \
  logs --tail=300 api admin kamailio rtpengine \
  > "static/runtime-verification/incidents/rollback-${STAMP}.log" 2>&1 || true

git rev-parse HEAD | tee "static/runtime-verification/incidents/failed-commit-${STAMP}.txt"
```

Notify stakeholders. If Telnyx DID routing was changed during the incident window, be prepared to revert carrier routing in the Telnyx console to the last known-good destination.

---

## T+5m — Application rollback (preferred)

### Option A — Redeploy previous git commit / tag

```bash
cd /opt/vsp-phone-v4

# Example: last known-good before RC1 freeze (adjust to your recorded pre-deploy commit)
PREV_COMMIT="$(cat backups/pre-rc1-*-commit.txt | head -1)"
# Or explicit prior tag/commit, e.g.:
# PREV_COMMIT=70689e7

git fetch --tags origin
git checkout "${PREV_COMMIT}"

export COMPOSE="docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.host-db.yml \
  --env-file .env"
export API_DOCKER_TARGET=production
export ADMIN_DOCKER_TARGET=production

$COMPOSE build --no-cache api admin
$COMPOSE up -d redis
$COMPOSE up -d --force-recreate --no-deps api admin
$COMPOSE up -d rtpengine kamailio
```

### Option B — Scripted redeploy of previous tree

After `git checkout` to the previous commit:

```bash
sudo bash scripts/platform/ec2-deploy-extension-first.sh
```

### Do not

- Overwrite `.env` during rollback
- Run destructive DB resets
- Point API at `vsp-voip` / `vsp-voip-postgres-1` as a “fix”

---

## T+10m — Database restore (only if required)

Use when migrations corrupted data, or writes during the bad deploy must be undone.

### 1. Stop writers

```bash
export COMPOSE="docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.host-db.yml \
  --env-file .env"

$COMPOSE stop api admin
```

### 2. Verify dump integrity

```bash
# Use the pre-deploy dump from the checklist
DUMP=$(ls -1t /opt/vsp-phone-v4/backups/pre-rc1-*-vsp_phone_v4.sql.gz | head -1)
gunzip -t "$DUMP"
ls -lah "$DUMP"
```

### 3. Restore into `vsp_phone_v4`

```bash
# CAUTION: replaces current DB contents
docker exec -i vsp-postgres psql -U vsp -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'vsp_phone_v4' AND pid <> pg_backend_pid();"

docker exec -i vsp-postgres psql -U vsp -d postgres -c \
  "DROP DATABASE IF EXISTS vsp_phone_v4;"
docker exec -i vsp-postgres psql -U vsp -d postgres -c \
  "CREATE DATABASE vsp_phone_v4 OWNER vsp;"

gunzip -c "$DUMP" | docker exec -i vsp-postgres psql -U vsp -d vsp_phone_v4
```

### 4. Restore uploads (if needed)

```bash
UPLOADS=$(ls -1t /opt/vsp-phone-v4/backups/pre-rc1-*-uploads.tgz | head -1)
sudo tar -xzf "$UPLOADS" -C /opt/vsp-phone-v4
```

### 5. Restore `.env` (only if it was altered)

```bash
ENV_BAK=$(ls -1t /opt/vsp-phone-v4/backups/env/.env.* | head -1)
sudo cp -a "$ENV_BAK" /opt/vsp-phone-v4/.env
sudo chmod 600 /opt/vsp-phone-v4/.env
```

### 6. Bring API back

```bash
$COMPOSE up -d --force-recreate --no-deps api admin
$COMPOSE up -d rtpengine kamailio
```

---

## T+20m — Verify recovery

```bash
curl -sk https://127.0.0.1:3000/api/health | jq .
curl -sk https://127.0.0.1:3000/api/ready | jq .
curl -sk https://api.vspphone.com/api/health | jq .
curl -sk https://api.vspphone.com/api/ready | jq .
curl -sk https://api.vspphone.com/api/health/kamailio | jq .
curl -sk https://api.vspphone.com/api/health/rtpengine | jq .

docker exec vsp-postgres psql -U vsp -d vsp_phone_v4 -c \
  "SELECT COUNT(*) AS tenants FROM tenants WHERE deleted_at IS NULL;"
```

Manual:

1. Platform login — `https://admin.vspphone.com/login`
2. Tenant login — `https://tenant.vspphone.com/login`
3. Extension Hub loads
4. One inbound + one outbound call on a known DID
5. Optional: `scripts/platform/db-integrity-verification.sql` if present

---

## Partial provisioning cleanup

If assign/bulk-assign partially succeeded before rollback:

1. Run integrity verification SQL (if available)
2. Unassign or fix affected DIDs in Platform Admin
3. Do **not** re-run bulk assign until integrity is clean
4. Prefer soft-delete / reassign paths already in RC1 over manual SQL deletes

---

## Nginx rollback

If nginx deploy caused the outage:

```bash
# deploy-nginx.sh backs up to /etc/nginx/backup-YYYYMMDD-HHMMSS
ls -1dt /etc/nginx/backup-* | head -3

BACKUP_DIR=$(ls -1dt /etc/nginx/backup-* | head -1)
sudo cp -a "${BACKUP_DIR}/sites-enabled/." /etc/nginx/sites-enabled/ 2>/dev/null || true
sudo nginx -t && sudo systemctl reload nginx
```

---

## Post-mortem (T+24h)

1. Document root cause and timeline
2. Update `docs/14-rc1/KNOWN-ISSUES.md` if the defect remains
3. Block re-release of the failed commit until the production-critical fix is verified
4. Confirm next deploy still starts from a fresh pre-deploy backup

---

## Quick reference — compose command

```bash
export COMPOSE="docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.host-db.yml \
  --env-file .env"
export API_DOCKER_TARGET=production
export ADMIN_DOCKER_TARGET=production
```
