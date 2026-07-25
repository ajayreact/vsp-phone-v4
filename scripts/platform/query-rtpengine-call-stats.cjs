#!/usr/bin/env node
'use strict';

/**
 * Query RTPengine's NG control port directly for real packet/byte counters
 * on a specific Call-ID — quantitative proof of two-way media flow, not
 * just "media path established" log lines.
 *
 * Usage (on EC2, rtpengine NG port is published to the host per
 * docker-compose.yml rtpengine.ports):
 *   node scripts/platform/query-rtpengine-call-stats.cjs list
 *   node scripts/platform/query-rtpengine-call-stats.cjs query <call-id>
 *
 * Env overrides: RTPENGINE_HOST (default 127.0.0.1), RTPENGINE_NG_PORT (default 2223)
 */

const dgram = require('node:dgram');

const HOST = process.env.RTPENGINE_HOST || '127.0.0.1';
const PORT = Number(process.env.RTPENGINE_NG_PORT || '2223');

function encodeBencode(value) {
  if (typeof value === 'string') {
    const buf = Buffer.from(value, 'utf8');
    return Buffer.concat([Buffer.from(`${buf.length}:`), buf]);
  }
  if (typeof value === 'number') {
    return Buffer.from(`i${Math.trunc(value)}e`);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([Buffer.from('l'), ...value.map(encodeBencode), Buffer.from('e')]);
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const parts = [Buffer.from('d')];
    for (const k of keys) parts.push(encodeBencode(k), encodeBencode(value[k]));
    parts.push(Buffer.from('e'));
    return Buffer.concat(parts);
  }
  return Buffer.from('0:');
}

function decodeAt(buf, i) {
  const c = buf[i];
  if (c === undefined) return [null, i];
  if (c === 0x6c /* l */) {
    const items = [];
    let pos = i + 1;
    while (buf[pos] !== 0x65) {
      const [v, next] = decodeAt(buf, pos);
      items.push(v);
      pos = next;
    }
    return [items, pos + 1];
  }
  if (c === 0x64 /* d */) {
    const obj = {};
    let pos = i + 1;
    while (buf[pos] !== 0x65) {
      const [k, p1] = decodeAt(buf, pos);
      const [v, p2] = decodeAt(buf, p1);
      obj[String(k)] = v;
      pos = p2;
    }
    return [obj, pos + 1];
  }
  if (c === 0x69 /* i */) {
    const end = buf.indexOf(0x65, i);
    return [Number(buf.subarray(i + 1, end).toString('utf8')), end + 1];
  }
  const colon = buf.indexOf(0x3a, i);
  const len = Number(buf.subarray(i, colon).toString('utf8'));
  const start = colon + 1;
  return [buf.subarray(start, start + len).toString('utf8'), start + len];
}

function decodeBencode(buf) {
  return decodeAt(buf, 0)[0];
}

function sendCommand(payload) {
  return new Promise((resolve, reject) => {
    const body = encodeBencode(payload);
    const socket = dgram.createSocket('udp4');
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`RTPengine NG timeout contacting ${HOST}:${PORT}`));
    }, 4000);
    socket.on('message', (msg) => {
      clearTimeout(timeout);
      socket.close();
      try {
        resolve(decodeBencode(msg));
      } catch {
        resolve({ raw: msg.toString('utf8') });
      }
    });
    socket.on('error', (err) => {
      clearTimeout(timeout);
      socket.close();
      reject(err);
    });
    socket.send(body, PORT, HOST, (err) => {
      if (err) {
        clearTimeout(timeout);
        socket.close();
        reject(err);
      }
    });
  });
}

// Recursively find every {packets, bytes, errors}-shaped leaf so this works
// regardless of exact rtpengine version's response schema.
function findCounters(obj, path, out) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => findCounters(v, `${path}[${i}]`, out));
    return;
  }
  const keys = Object.keys(obj);
  if (keys.some((k) => /^(packets|bytes|errors)$/.test(k))) {
    out.push({
      path,
      packets: obj.packets,
      bytes: obj.bytes,
      errors: obj.errors,
    });
  }
  for (const k of keys) findCounters(obj[k], `${path}.${k}`, out);
}

async function main() {
  const cmd = process.argv[2];
  const callId = process.argv[3];

  if (cmd === 'list') {
    console.log(`Querying ${HOST}:${PORT} for active call-ids ...`);
    const res = await sendCommand({ command: 'list' });
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (cmd === 'query') {
    if (!callId) {
      console.error('Usage: node query-rtpengine-call-stats.cjs query <call-id>');
      process.exit(1);
    }
    console.log(`Querying ${HOST}:${PORT} for call-id=${callId} ...`);
    const res = await sendCommand({ command: 'query', 'call-id': callId });
    console.log('\n=== Raw NG response ===');
    console.log(JSON.stringify(res, null, 2));

    if (res && res.result === 'error') {
      console.log(`\nRTPengine returned an error: ${res['error-reason'] || '(no reason given)'}`);
      console.log('This usually means the call-id is unknown to RTPengine (call never got a media session, or already expired/deleted).');
      return;
    }

    const counters = [];
    findCounters(res, '$', counters);
    console.log('\n=== Packet/byte counters found (per stream/leg) ===');
    if (!counters.length) {
      console.log('(none found in response — check the raw response above for this rtpengine version\'s schema)');
    } else {
      for (const c of counters) {
        console.log(`${c.path}: packets=${c.packets ?? '?'} bytes=${c.bytes ?? '?'} errors=${c.errors ?? '?'}`);
      }
      const nonZero = counters.filter((c) => Number(c.packets) > 0);
      console.log(
        `\n${nonZero.length} of ${counters.length} stream(s) show packets>0. ` +
          `For two-way audio you need packets>0 on BOTH the caller-facing and carrier-facing legs.`,
      );
    }
    return;
  }

  console.error('Usage:\n  node query-rtpengine-call-stats.cjs list\n  node query-rtpengine-call-stats.cjs query <call-id>');
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
