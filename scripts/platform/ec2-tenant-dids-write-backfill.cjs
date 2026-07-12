'use strict';

/**
 * EC2 production RBAC backfill: grant tenant:dids:write to Tenant Admin.
 * Uses DATABASE_URL from the environment (same as vsp-api). No placeholders.
 *
 * Usage (on EC2):
 *   source scripts/platform/ec2-compose-env.sh
 *   $COMPOSE run --rm --no-deps api node scripts/platform/ec2-tenant-dids-write-backfill.cjs
 */

const { Client } = require('pg');

const MIGRATION_NAME = '20260712150000_tenant_dids_write_permission';

const BACKFILL_SQL = `
INSERT INTO permissions (id, public_id, tenant_id, key, description, version, created_at, updated_at)
SELECT gen_random_uuid(),
       'perm_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
       t.id,
       'tenant:dids:write',
       'tenant:dids:write',
       1,
       NOW(),
       NOW()
FROM tenants t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM permissions p
    WHERE p.tenant_id = t.id
      AND p.key = 'tenant:dids:write'
      AND p.deleted_at IS NULL
  );

INSERT INTO role_permissions (id, tenant_id, role_id, permission_id, created_at, updated_at)
SELECT gen_random_uuid(),
       r.tenant_id,
       r.id,
       p.id,
       NOW(),
       NOW()
FROM roles r
JOIN permissions p
  ON p.tenant_id = r.tenant_id
 AND p.key = 'tenant:dids:write'
 AND p.deleted_at IS NULL
WHERE r.name = 'Tenant Admin'
  AND r.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission_id = p.id
      AND rp.deleted_at IS NULL
  );
`;

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is not set');
    process.exit(1);
  }

  const safeUrl = databaseUrl.replace(/:([^:@/]+)@/, ':***@');
  console.log(JSON.stringify({ event: 'backfill.start', databaseUrl: safeUrl }));

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const dbRow = await client.query('SELECT current_database() AS db');
    const tenantCount = await client.query(
      'SELECT COUNT(*)::int AS n FROM tenants WHERE deleted_at IS NULL',
    );
    console.log(
      JSON.stringify({
        event: 'backfill.database',
        database: dbRow.rows[0]?.db,
        activeTenants: tenantCount.rows[0]?.n ?? 0,
      }),
    );

    if ((tenantCount.rows[0]?.n ?? 0) === 0) {
      console.warn(
        JSON.stringify({
          event: 'backfill.warn_no_tenants',
          message:
            'No active tenants in DATABASE_URL database. Run scripts/platform/ec2-probe-tenant-databases.cjs to find the database with production data.',
        }),
      );
    }

    const mig = await client.query(
      `SELECT migration_name, finished_at, rolled_back_at
       FROM _prisma_migrations
       WHERE migration_name = $1`,
      [MIGRATION_NAME],
    );
    console.log(
      JSON.stringify({
        event: 'backfill.migration_status',
        migration: MIGRATION_NAME,
        status: mig.rows.length
          ? mig.rows[0].rolled_back_at
            ? 'Failed'
            : 'Applied'
          : 'Pending',
        finishedAt: mig.rows[0]?.finished_at ?? null,
      }),
    );

    await client.query('BEGIN');
    await client.query(BACKFILL_SQL);
    await client.query('COMMIT');

    const permCount = await client.query(
      `SELECT COUNT(*)::int AS n FROM permissions
       WHERE key = 'tenant:dids:write' AND deleted_at IS NULL`,
    );
    const roleCount = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
       JOIN roles r ON r.id = rp.role_id AND r.deleted_at IS NULL
       WHERE p.key = 'tenant:dids:write'
         AND r.name = 'Tenant Admin'
         AND rp.deleted_at IS NULL`,
    );

    console.log(
      JSON.stringify({
        event: 'backfill.complete',
        permissions_tenant_dids_write: permCount.rows[0]?.n ?? 0,
        tenant_admin_assignments: roleCount.rows[0]?.n ?? 0,
      }),
    );

    if ((roleCount.rows[0]?.n ?? 0) === 0 && (tenantCount.rows[0]?.n ?? 0) > 0) {
      console.error('ERROR: Tenants exist but no Tenant Admin role links were created. Check roles table.');
      process.exit(1);
    }
    if ((tenantCount.rows[0]?.n ?? 0) === 0) {
      process.exit(2);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(JSON.stringify({ event: 'backfill.failed', error: String(err) }));
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
