'use strict';

/**
 * Verify tenant:dids:write RBAC and optional JWT user permissions.
 *
 * Usage:
 *   $COMPOSE run --rm --no-deps api node scripts/platform/ec2-verify-tenant-dids-write.cjs
 *   $COMPOSE run --rm --no-deps api node scripts/platform/ec2-verify-tenant-dids-write.cjs --email=admin@tenant.com
 */

const { Client } = require('pg');

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is not set');
    process.exit(1);
  }

  const emailArg = process.argv.find((a) => a.startsWith('--email='));
  const email = emailArg ? emailArg.slice('--email='.length) : null;

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const dbRow = await client.query('SELECT current_database() AS db');
    const mig = await client.query(
      `SELECT migration_name, finished_at, rolled_back_at
       FROM _prisma_migrations
       WHERE migration_name = '20260712150000_tenant_dids_write_permission'`,
    );

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

    const report = {
      database: dbRow.rows[0]?.db,
      migration_20260712150000: mig.rows.length
        ? mig.rows[0].rolled_back_at
          ? 'Failed'
          : 'Applied'
        : 'Pending',
      permissions_tenant_dids_write: permCount.rows[0]?.n ?? 0,
      tenant_admin_assignments: roleCount.rows[0]?.n ?? 0,
    };

    if (email) {
      const user = await client.query(
        `SELECT u.id, u.email, u.tenant_id
         FROM users u
         WHERE lower(u.email) = lower($1) AND u.deleted_at IS NULL
         LIMIT 1`,
        [email],
      );
      if (!user.rows.length) {
        report.user = { email, found: false };
      } else {
        const u = user.rows[0];
        const roles = await client.query(
          `SELECT r.name
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
           WHERE ur.user_id = $1 AND ur.deleted_at IS NULL`,
          [u.id],
        );
        const perms = await client.query(
          `SELECT DISTINCT p.key
           FROM user_roles ur
           JOIN role_permissions rp ON rp.role_id = ur.role_id AND rp.deleted_at IS NULL
           JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
           WHERE ur.user_id = $1 AND ur.deleted_at IS NULL
           ORDER BY p.key`,
          [u.id],
        );
        report.user = {
          userId: u.id,
          tenantId: u.tenant_id,
          email: u.email,
          roles: roles.rows.map((r) => r.name),
          permissions: perms.rows.map((p) => p.key),
          hasTenantDidsWrite: perms.rows.some((p) => p.key === 'tenant:dids:write'),
        };
      }
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
