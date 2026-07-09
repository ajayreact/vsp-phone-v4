'use strict';

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? '5'),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? '10000'),
  });
  return new PrismaClient({ adapter });
}

module.exports = { createPrismaClient };
