'use strict';

/**
 * Verify Super Admin JWT + DB permission (platform:super_admin).
 * JWT payload does NOT embed permissions — RBAC is checked via Prisma at request time.
 *
 * Usage:
 *   JWT=eyJ... node scripts/platform/verify-super-admin.cjs
 *   node scripts/platform/verify-super-admin.cjs --token=eyJ...
 */

const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const { createPrismaClient } = require('./prisma-client.cjs');
const { createHmac, timingSafeEqual } = require('node:crypto');

const SUPER_ADMIN_PERMISSION = 'platform:super_admin';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) out[arg.slice(2)] = true;
    else out[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return out;
}

function decodeJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  try {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || !payload.tenantId || !payload.exp || payload.exp < now) return null;
  return payload;
}

async function userHasPermission(prisma, userId, permissionKey) {
  const count = await prisma.rolePermission.count({
    where: {
      deletedAt: null,
      permission: { key: permissionKey, deletedAt: null },
      role: {
        deletedAt: null,
        userRoles: { some: { userId, deletedAt: null } },
      },
    },
  });
  return count > 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = (args.token || process.env.JWT || '').trim();
  const secret = process.env.JWT_SECRET || process.env.DEV_JWT_SECRET;
  if (!token) throw new Error('Provide --token= or JWT env var');
  if (!secret) throw new Error('JWT_SECRET not configured');

  const payload = decodeJwt(token, secret);
  if (!payload) throw new Error('Invalid or expired JWT');

  const prisma = createPrismaClient();
  try {
    const permissions = await prisma.rolePermission.findMany({
      where: {
        deletedAt: null,
        role: {
          deletedAt: null,
          userRoles: { some: { userId: payload.sub, deletedAt: null } },
        },
      },
      include: { permission: true },
      take: 50,
    });
    const keys = permissions.map((r) => r.permission.key).filter(Boolean);
    const hasSuperAdmin = keys.includes(SUPER_ADMIN_PERMISSION);

    console.log(
      JSON.stringify(
        {
          ok: true,
          jwt: {
            sub: payload.sub,
            tenantId: payload.tenantId,
            email: payload.email,
            exp: payload.exp,
            note: 'JWT does not embed permissions; RBAC resolved from database at request time',
          },
          permissions: keys,
          hasPlatformSuperAdmin: hasSuperAdmin,
        },
        null,
        2,
      ),
    );
    process.exit(hasSuperAdmin ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, message: err.message }));
  process.exit(1);
});
