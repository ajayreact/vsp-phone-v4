'use strict';

/**
 * Production bootstrap — first Platform Super Admin (RC1).
 * Creates Platform tenant, platform:super_admin permission, role, user (transactional).
 * Idempotent: re-run updates password for existing email; never duplicates tenant/permission.
 *
 * Usage:
 *   npm run platform:bootstrap
 *   node scripts/platform/bootstrap-super-admin.cjs --email=ops@example.com --password='***' --name='Ops Admin'
 *
 * Docker (EC2):
 *   docker compose exec api node scripts/platform/bootstrap-super-admin.cjs
 */

const { createInterface } = require('node:readline');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const { TenantStatus, UserStatus } = require('@prisma/client');
const { hashPassword } = require('./password.util.cjs');
const { createPrismaClient } = require('./prisma-client.cjs');

const PLATFORM_TENANT_SLUG = 'platform';
const PLATFORM_TENANT_NAME = 'Platform';
const SUPER_ADMIN_ROLE_NAME = 'Super Admin';
const SUPER_ADMIN_PERMISSION = 'platform:super_admin';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) {
      out[arg.slice(2)] = true;
      continue;
    }
    out[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return out;
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function promptHidden(rl, question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    let value = '';
    const onData = (chunk) => {
      const s = chunk.toString();
      for (const ch of s) {
        if (ch === '\r' || ch === '\n') {
          stdin.off('data', onData);
          if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') process.exit(130);
        if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    stdin.on('data', onData);
    stdin.resume();
  });
}

function splitName(fullName) {
  const trimmed = fullName.trim();
  const space = trimmed.indexOf(' ');
  if (space === -1) {
    return { firstName: trimmed, lastName: trimmed, displayName: trimmed };
  }
  const firstName = trimmed.slice(0, space).trim();
  const lastName = trimmed.slice(space + 1).trim() || firstName;
  return { firstName, lastName, displayName: trimmed };
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function collectInputs(args) {
  let email = (args.email || process.env.BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  let password = args.password || process.env.BOOTSTRAP_PASSWORD || '';
  let name = (args.name || process.env.BOOTSTRAP_NAME || '').trim();

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    if (!email) {
      email = (await prompt(rl, 'Super Admin email: ')).trim().toLowerCase();
    }
    if (!validateEmail(email)) {
      throw new Error('Invalid email address');
    }

    if (!name) {
      name = (await prompt(rl, 'Full name: ')).trim();
    }
    if (!name) {
      throw new Error('Name is required');
    }

    if (!password) {
      password = await promptHidden(rl, 'Password (hidden): ');
      const confirm = await promptHidden(rl, 'Confirm password (hidden): ');
      if (password !== confirm) {
        throw new Error('Passwords do not match');
      }
    }
    if (password.length < 12) {
      throw new Error('Password must be at least 12 characters');
    }

    return { email, password, name };
  } finally {
    rl.close();
  }
}

async function bootstrapSuperAdmin({ email, password, name }) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set (check .env)');
  }

  const prisma = createPrismaClient();
  const passwordHash = hashPassword(password);
  const { firstName, lastName, displayName } = splitName(name);
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      let tenant = await tx.tenant.findFirst({
        where: { slug: PLATFORM_TENANT_SLUG, deletedAt: null },
      });

      let tenantCreated = false;
      if (!tenant) {
        const tenantId = randomUUID();
        tenant = await tx.tenant.create({
          data: {
            id: tenantId,
            publicId: 't-platform',
            name: PLATFORM_TENANT_NAME,
            displayName: PLATFORM_TENANT_NAME,
            slug: PLATFORM_TENANT_SLUG,
            status: TenantStatus.ACTIVE,
          },
        });
        await tx.tenantSettings.create({
          data: {
            id: randomUUID(),
            tenantId: tenant.id,
            timezone: 'UTC',
            defaultLanguage: 'en',
          },
        });
        tenantCreated = true;
      }

      let permission = await tx.permission.findFirst({
        where: {
          tenantId: tenant.id,
          key: SUPER_ADMIN_PERMISSION,
          deletedAt: null,
        },
      });
      let permissionCreated = false;
      if (!permission) {
        permission = await tx.permission.create({
          data: {
            id: randomUUID(),
            publicId: 'perm-platform-super-admin',
            tenantId: tenant.id,
            key: SUPER_ADMIN_PERMISSION,
            description: 'Platform Super Admin — migration, cutover, and platform operations',
          },
        });
        permissionCreated = true;
      }

      let role = await tx.role.findFirst({
        where: {
          tenantId: tenant.id,
          name: SUPER_ADMIN_ROLE_NAME,
          deletedAt: null,
        },
      });
      let roleCreated = false;
      if (!role) {
        role = await tx.role.create({
          data: {
            id: randomUUID(),
            publicId: 'r-platform-super-admin',
            tenantId: tenant.id,
            name: SUPER_ADMIN_ROLE_NAME,
            description: 'Platform Super Admin role',
            systemRole: true,
          },
        });
        roleCreated = true;
      }

      const existingRp = await tx.rolePermission.findFirst({
        where: {
          tenantId: tenant.id,
          roleId: role.id,
          permissionId: permission.id,
          deletedAt: null,
        },
      });
      let rolePermissionCreated = false;
      if (!existingRp) {
        await tx.rolePermission.create({
          data: {
            id: randomUUID(),
            tenantId: tenant.id,
            roleId: role.id,
            permissionId: permission.id,
          },
        });
        rolePermissionCreated = true;
      }

      let user = await tx.user.findFirst({
        where: {
          tenantId: tenant.id,
          email: { equals: email, mode: 'insensitive' },
          deletedAt: null,
        },
      });

      let userCreated = false;
      let passwordUpdated = false;

      if (user) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: user.emailVerifiedAt ?? now,
            updatedAt: now,
          },
        });
        passwordUpdated = true;

        const profile = await tx.userProfile.findFirst({
          where: { userId: user.id, deletedAt: null },
        });
        if (profile) {
          await tx.userProfile.update({
            where: { id: profile.id },
            data: { firstName, lastName, displayName },
          });
        } else {
          await tx.userProfile.create({
            data: {
              id: randomUUID(),
              tenantId: tenant.id,
              userId: user.id,
              firstName,
              lastName,
              displayName,
            },
          });
        }
      } else {
        const userId = randomUUID();
        user = await tx.user.create({
          data: {
            id: userId,
            publicId: `u-${email.split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'superadmin'}`,
            tenantId: tenant.id,
            email,
            passwordHash,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: now,
          },
        });
        await tx.userProfile.create({
          data: {
            id: randomUUID(),
            tenantId: tenant.id,
            userId: user.id,
            firstName,
            lastName,
            displayName,
          },
        });
        userCreated = true;
      }

      const existingUr = await tx.userRole.findFirst({
        where: {
          tenantId: tenant.id,
          userId: user.id,
          roleId: role.id,
          siteId: null,
          deletedAt: null,
        },
      });
      let userRoleCreated = false;
      if (!existingUr) {
        await tx.userRole.create({
          data: {
            id: randomUUID(),
            tenantId: tenant.id,
            userId: user.id,
            roleId: role.id,
          },
        });
        userRoleCreated = true;
      }

      return {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        userId: user.id,
        email: user.email,
        tenantCreated,
        permissionCreated,
        roleCreated,
        rolePermissionCreated,
        userCreated,
        passwordUpdated,
        userRoleCreated,
      };
    });

    return result;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: npm run platform:bootstrap [-- --email=... --password=... --name=...]

Creates (idempotent):
  - Platform tenant (slug: ${PLATFORM_TENANT_SLUG})
  - Permission ${SUPER_ADMIN_PERMISSION}
  - Role "${SUPER_ADMIN_ROLE_NAME}"
  - Super Admin user with role mapping

Re-run with same email updates password only.`);
    process.exit(0);
  }

  const inputs = await collectInputs(args);
  const result = await bootstrapSuperAdmin(inputs);

  console.log(
    JSON.stringify(
      {
        ok: true,
        event: 'platform.bootstrap.super_admin',
        email: result.email,
        userId: result.userId,
        tenantId: result.tenantId,
        tenantSlug: result.tenantSlug,
        permission: SUPER_ADMIN_PERMISSION,
        created: {
          tenant: result.tenantCreated,
          permission: result.permissionCreated,
          role: result.roleCreated,
          rolePermission: result.rolePermissionCreated,
          user: result.userCreated,
          userRole: result.userRoleCreated,
        },
        passwordUpdated: result.passwordUpdated,
        next: 'POST /api/v1/auth/login then POST /api/v1/cutover/smoke-test with Bearer JWT',
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, event: 'platform.bootstrap.failed', message: err.message }));
  process.exit(1);
});
