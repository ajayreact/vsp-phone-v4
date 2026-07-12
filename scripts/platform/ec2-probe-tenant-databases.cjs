'use strict';

/**
 * List PostgreSQL databases on the same host as DATABASE_URL and count active tenants.
 * Use when tenant:dids:write backfill reports 0 tenants.
 *
 * Usage:
 *   source scripts/platform/ec2-compose-env.sh
 *   $COMPOSE run --rm --no-deps api node scripts/platform/ec2-probe-tenant-databases.cjs
 */

const { Client } = require('pg');

function adminUrl(databaseUrl) {
  const u = new URL(databaseUrl);
  u.pathname = '/postgres';
  u.search = '';
  return u.toString();
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is not set');
    process.exit(1);
  }

  const admin = new Client({ connectionString: adminUrl(databaseUrl) });
  await admin.connect();

  const { rows: dbs } = await admin.query(
    `SELECT datname FROM pg_database
     WHERE datistemplate = false
       AND datname NOT IN ('postgres')
     ORDER BY datname`,
  );

  const results = [];
  for (const { datname } of dbs) {
    const u = new URL(databaseUrl);
    u.pathname = `/${datname}`;
    u.search = '';
    const c = new Client({ connectionString: u.toString() });
    try {
      await c.connect();
      const tenants = await c.query(
        `SELECT COUNT(*)::int AS n FROM tenants WHERE deleted_at IS NULL`,
      ).catch(() => ({ rows: [{ n: null }] }));
      const extensions = await c.query(
        `SELECT COUNT(*)::int AS n FROM extensions WHERE deleted_at IS NULL`,
      ).catch(() => ({ rows: [{ n: null }] }));
      results.push({
        database: datname,
        activeTenants: tenants.rows[0]?.n,
        activeExtensions: extensions.rows[0]?.n,
      });
    } catch {
      results.push({ database: datname, activeTenants: null, activeExtensions: null, error: 'connect_failed' });
    } finally {
      await c.end().catch(() => {});
    }
  }

  await admin.end();

  console.log(JSON.stringify({ event: 'probe.databases', results }, null, 2));
  const withData = results.filter((r) => (r.activeTenants ?? 0) > 0);
  if (withData.length === 0) {
    console.warn('No database with active tenants found on this Postgres host.');
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      event: 'probe.recommendation',
      message: 'Set POSTGRES_APP_DB in .env to the database with tenants, then recreate api.',
      databasesWithTenants: withData.map((r) => r.database),
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
