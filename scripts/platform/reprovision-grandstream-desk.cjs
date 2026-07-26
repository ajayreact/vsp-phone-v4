#!/usr/bin/env node
'use strict';

/**
 * Force-regenerate Grandstream desk cfg.xml with current template + env (template 1.4.0+).
 *
 * Clears Redis artifact pointers so the next prov fetch re-renders XML, then triggers
 * render by HTTP GET to the public prov URL (same path the phone uses).
 *
 * Usage (EC2, inside repo root or api container):
 *   node scripts/platform/reprovision-grandstream-desk.cjs --mac ec74d751e3e7
 *   docker exec vsp-api node scripts/platform/reprovision-grandstream-desk.cjs --mac ec74d751e3e7
 */

const path = require('node:path');

try {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
} catch {
  /* production image may omit dotenv */
}

const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const macRaw = (argVal('--mac') || process.env.MAC || 'ec74d751e3e7').toLowerCase().replace(/[^a-f0-9]/gi, '');
const provBase = (process.env.PROV_PUBLIC_BASE_URL || 'https://prov.vspphone.com').replace(/\/$/, '');
const provUrl = `${provBase}/gs/${macRaw}/cfg.xml`;

function deviceMetaKey(tenantId, deviceId) {
  return `vsp:${tenantId}:prov:device:${deviceId}:meta`;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(2);
  }
  if (!/^[a-f0-9]{12}$/.test(macRaw)) {
    console.error(`Invalid MAC: ${macRaw}`);
    process.exit(2);
  }

  const pg = require('pg');
  const Redis = require('ioredis');
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const row = (
      await client.query(
        `SELECT d.id AS device_id, d.tenant_id, d.mac_address, d.name
         FROM devices d
         WHERE lower(d.mac_address) = $1 AND d.deleted_at IS NULL
         LIMIT 1`,
        [macRaw],
      )
    ).rows[0];

    if (!row) {
      console.error(`No device for MAC ${macRaw}`);
      process.exit(1);
    }

    const metaKey = deviceMetaKey(row.tenant_id, row.device_id);
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 5000 });
    const before = await redis.hgetall(metaKey);
    await redis.hdel(metaKey, 'objectKey', 'artifactHash');
    await redis.quit();

    console.log(JSON.stringify({
      event: 'provisioning.grandstream.force_rerender',
      mac: macRaw,
      deviceId: row.device_id,
      tenantId: row.tenant_id,
      previousArtifactHash: before.artifactHash || null,
      previousTemplateVersion: before.templateVersion || null,
      provUrl,
    }));

    const res = await fetch(provUrl, {
      headers: { 'User-Agent': 'vsp-reprovision-grandstream-desk/1.0' },
    });
    const xml = await res.text();
    if (!res.ok) {
      console.error(`Prov fetch failed HTTP ${res.status}`);
      process.exit(1);
    }

    const checks = [
      ['P207', /<P207>([^<]+)<\/P207>/],
      ['P208 DEBUG', /<P208>1<\/P208>/],
      ['P1387 SIP log', /<P1387>1<\/P1387>/],
      ['P729 early dial', /<P729>1<\/P729>/],
    ];
    for (const [label, re] of checks) {
      const ok = re.test(xml);
      console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
      if (!ok) process.exitCode = 1;
    }

    const p207 = xml.match(/<P207>([^<]+)<\/P207>/);
    if (p207) console.log(`P207=${p207[1]}`);
    console.log(`artifact_bytes=${Buffer.byteLength(xml)}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
