#!/usr/bin/env node
'use strict';

/**
 * Ensure a dedicated Platform Inventory tenant exists and is wired into
 * platformSettings.inventoryTenantId (and optionally print env for VSP_PLATFORM_INVENTORY_TENANT_ID).
 *
 *   DATABASE_URL=... node scripts/platform/ensure-platform-inventory-tenant.cjs
 */

const { randomUUID } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const { createPrismaClient } = require('./prisma-client.cjs');

const SLUG = 'platform-inventory';
const NAME = 'Platform Inventory';

async function main() {
  const prisma = createPrismaClient();
  try {
    let tenant = await prisma.tenant.findFirst({
      where: { slug: SLUG, deletedAt: null },
    });

    if (!tenant) {
      const id = randomUUID();
      tenant = await prisma.tenant.create({
        data: {
          id,
          publicId: `t-inv-${id.slice(0, 8)}`,
          name: NAME,
          displayName: NAME,
          slug: SLUG,
          status: 'ACTIVE',
        },
      });
      console.log(`Created inventory tenant ${tenant.id} (${SLUG})`);
    } else {
      console.log(`Found inventory tenant ${tenant.id} (${SLUG})`);
    }

    let settings = await prisma.platformSettings.findFirst();
    if (!settings) {
      settings = await prisma.platformSettings.create({
        data: {
          id: randomUUID(),
          platformName: 'VSP Phone',
          supportEmail: 'support@vspphone.com',
          defaultTimezone: 'UTC',
          inventoryTenantId: tenant.id,
        },
      });
      console.log('Created platformSettings with inventoryTenantId');
    } else if (settings.inventoryTenantId !== tenant.id) {
      await prisma.platformSettings.update({
        where: { id: settings.id },
        data: { inventoryTenantId: tenant.id },
      });
      console.log(`Updated platformSettings.inventoryTenantId → ${tenant.id}`);
    } else {
      console.log('platformSettings.inventoryTenantId already correct');
    }

    console.log('\nSet env for API process:');
    console.log(`VSP_PLATFORM_INVENTORY_TENANT_ID=${tenant.id}`);
    console.log(JSON.stringify({ ok: true, inventoryTenantId: tenant.id, slug: SLUG }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
