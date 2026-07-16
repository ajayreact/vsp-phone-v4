# Defect — RC1 Promotion Blocker

| Field | Value |
|-------|-------|
| Date | 2026-07-17 |
| ID | **ENV-03** |
| Severity | **P0 (Critical)** |
| Failing command | `npx prisma migrate deploy` (on EC2 host) |
| Environment | AWS EC2 `i-0bbf0447258689e27` / `/opt/vsp-phone-v4` |
| Category | Environment / how the command is invoked |
| Status | **Open** |
| Application code change | **None** |
| Do not reopen | ENV-01 |

## Symptom

```text
Error: P1001: Can't reach database server at `localhost:5432`
Datasource "db": PostgreSQL database "vsp_phone_v4", schema "public" at "localhost:5432"
```

## Root cause

On this AWS host, Prisma CLI on the **EC2 host shell** reads `DATABASE_URL` with host **`localhost:5432`**.

With the staging Compose layout (`docker-compose.host-db.yml` clears published Postgres ports), the database listens on the **Docker network** (service name typically `postgres`), **not** on the host’s `localhost:5432`.

So:

- `$COMPOSE exec … psql` → works (inside Docker network)  
- `npx prisma migrate deploy` on the host → **P1001** (wrong network namespace)

This is **not** an AWS Postgres auth failure and **not** ENV-01.

## Minimum recovery (operator)

Do **not** change application code. Prefer running migrate **inside** Compose (same network as the DB).

```bash
cd /opt/vsp-phone-v4
source scripts/platform/ec2-compose-env.sh   # if you use it

# Preferred: run Prisma from the API container (uses container DATABASE_URL → postgres host)
$COMPOSE run --rm --no-deps api npx prisma migrate deploy
```

If `api` image has no `npx`/prisma, use:

```bash
$COMPOSE run --rm --no-deps api node ./node_modules/prisma/build/index.js migrate deploy
# or, if prisma is a dependency of the app image:
$COMPOSE exec api npx prisma migrate deploy
```

### Optional check (do not paste secrets)

```bash
# Confirm API container DB host is NOT localhost
$COMPOSE exec -T api printenv DATABASE_URL | sed -E 's#://[^:]+:[^@]+@#://***:***@#'
```

Expect something like host `postgres` or `host.docker.internal`, not reliance on host `localhost` without a published port.

### Only if you must run Prisma on the host

Expose Postgres on the host **or** set a host-reachable `DATABASE_URL` for that shell session (operator decision). Prefer the Compose `run` approach above to avoid leaving Postgres open on the public interface.

## After success

Rerun the failed step (migrate via Compose), then continue:

```bash
npm run platform:rc1-infra
# If rc1-infra also uses host DATABASE_URL and fails the same way:
$COMPOSE run --rm --no-deps api node scripts/platform/rc1-infrastructure-validate.cjs
# or ensure DATABASE_URL in that process points at the Docker DB

RC1_PROFILE=production npm run platform:rc1-env
```

## Note

`echo 'VSP_PLATFORM_INVENTORY_TENANT_ID=…' >> .env` may have **duplicated** the key if it already existed. Check with `grep -n VSP_PLATFORM_INVENTORY_TENANT_ID .env` and keep a single line. Not the cause of P1001.
