#!/usr/bin/env node
'use strict';

/**
 * Read-only SIP scanner/fraud analysis from vsp-kamailio's docker logs.
 * No firewall changes here — this only reports and recommends. Run on EC2
 * (needs `docker logs` access to vsp-kamailio).
 *
 * Usage:
 *   node scripts/platform/analyze-sip-abuse.cjs                 # last 168h (7d), best-effort
 *   node scripts/platform/analyze-sip-abuse.cjs --hours 72
 *   node scripts/platform/analyze-sip-abuse.cjs --json report.json
 *
 * IMPORTANT: docker's json-file driver here is capped (max-size 10m x
 * max-file 3 = ~30MB total, see docker-compose.yml x-logging). Under heavy
 * scanner traffic this can rotate out well before 7 days. This script
 * reports the ACTUAL first/last timestamp it found so you know the real
 * coverage window — never assume the requested window was fully available.
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const HOURS = Number(getArg('hours', '168'));
const CONTAINER = getArg('container', 'vsp-kamailio');
const JSON_OUT = getArg('json', null);
const PERMISSIONS_FILE = getArg(
  'permissions-file',
  path.resolve(__dirname, '../../infrastructure/kamailio/permissions.address'),
);

function loadTrustedRanges() {
  const ranges = [];
  try {
    const text = fs.readFileSync(PERMISSIONS_FILE, 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 3) continue;
      const [group, ip, mask] = parts;
      ranges.push({ group, ip, mask: Number(mask), label: parts[6] || parts[5] || '' });
    }
  } catch (err) {
    console.error(`WARN: could not read ${PERMISSIONS_FILE}: ${err.message}`);
  }
  return ranges;
}

function ipToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inRange(ip, rangeIp, maskBits) {
  const ipInt = ipToInt(ip);
  const rangeInt = ipToInt(rangeIp);
  if (ipInt === null || rangeInt === null) return false;
  const maskInt = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (ipInt & maskInt) === (rangeInt & maskInt);
}

function classifyTrust(ip, ranges) {
  for (const r of ranges) {
    if (inRange(ip, r.ip, r.mask)) {
      return { trusted: true, group: r.group, label: r.label || (r.group === '2' ? 'telnyx_carrier' : 'internal') };
    }
  }
  return { trusted: false, group: null, label: null };
}

function fetchLogs() {
  const maxBuffer = 512 * 1024 * 1024;
  try {
    return execSync(`docker logs -t --since ${HOURS}h ${CONTAINER} 2>&1`, {
      maxBuffer,
      encoding: 'utf8',
    });
  } catch (err) {
    // execSync throws on non-zero exit even if stdout has useful data (docker logs
    // usually exits 0, but be defensive).
    if (err.stdout) return err.stdout;
    throw err;
  }
}

// Docker -t prefixes every line with an RFC3339 timestamp: "2026-07-25T02:55:12.123456789Z <line>"
const TS_RE = /^(\S+)\s(.*)$/;
const CTX_RE = /\{1\s+\d+\s+\S+\s+([^@\s}]+@[^\s}]+)\}/; // {1 <tid> METHOD callid}
const INVITE_RE = /INVITE r-uri=(\S+) from=(\S+) to=(\S+) callid=(\S+) src=(\S+)/;
const REGISTER_RE = /REGISTER aor=(\S+) contact=(\S+) expires=(\S*) proto=(\S+) src=(\S+)/;
const REGISTER_DENIED_RE = /REGISTER denied by NestJS user=(\S+) res=/;
const OPTIONS_RE = /OPTIONS health from ([\d.]+):(\d+) proto=(\S+)/;
const MALFORMED_RE = /Malformed SIP from ([\d.]+):(\d+)/;
const PIKE_RE = /PIKE block ([\d.]+):(\d+) method=(\S+)/;
const BANNED_DROP_RE = /Banned IP ([\d.]+) — drop/;
const NESTJS_REJECT_RE = /INVITE rejected by NestJS code=(\d+)/;

function parse(logText) {
  const lines = logText.split('\n');
  const byIp = new Map();
  const callidToIp = new Map();
  let minTs = null;
  let maxTs = null;
  let totalLines = 0;

  const ensure = (ip) => {
    if (!byIp.has(ip)) {
      byIp.set(ip, {
        ip,
        firstSeen: null,
        lastSeen: null,
        invite: 0,
        registerAttempt: 0,
        registerDenied: 0,
        options: 0,
        malformed: 0,
        pikeBlocked: 0,
        bannedDrop: 0,
        distinctRegisterUsers: new Set(),
        distinctInviteTargets: new Set(),
        distinctCallIds: new Set(),
      });
    }
    return byIp.get(ip);
  };

  const touch = (ip, ts) => {
    const rec = ensure(ip);
    if (!rec.firstSeen || ts < rec.firstSeen) rec.firstSeen = ts;
    if (!rec.lastSeen || ts > rec.lastSeen) rec.lastSeen = ts;
  };

  for (const raw of lines) {
    if (!raw) continue;
    const m = TS_RE.exec(raw);
    if (!m) continue;
    const ts = m[1];
    const content = m[2];
    if (!ts.includes('T')) continue;
    totalLines++;
    if (!minTs || ts < minTs) minTs = ts;
    if (!maxTs || ts > maxTs) maxTs = ts;

    const ctxMatch = CTX_RE.exec(content);
    const ctxCallId = ctxMatch ? ctxMatch[1] : null;

    let im;
    if ((im = INVITE_RE.exec(content))) {
      const [, ruri, from, , callid, src] = im;
      const ip = src.split(':')[0];
      touch(ip, ts);
      const rec = ensure(ip);
      rec.invite++;
      rec.distinctInviteTargets.add(ruri);
      rec.distinctCallIds.add(callid);
      callidToIp.set(callid, ip);
    } else if ((im = REGISTER_RE.exec(content))) {
      const [, , , , , src] = im;
      const ip = src.split(':')[0];
      touch(ip, ts);
      ensure(ip).registerAttempt++;
      if (ctxCallId) callidToIp.set(ctxCallId, ip);
    } else if ((im = REGISTER_DENIED_RE.exec(content))) {
      const user = im[1];
      const ip = ctxCallId ? callidToIp.get(ctxCallId) : null;
      if (ip) {
        touch(ip, ts);
        const rec = ensure(ip);
        rec.registerDenied++;
        rec.distinctRegisterUsers.add(user);
      }
    } else if ((im = OPTIONS_RE.exec(content))) {
      const ip = im[1];
      touch(ip, ts);
      ensure(ip).options++;
    } else if ((im = MALFORMED_RE.exec(content))) {
      const ip = im[1];
      touch(ip, ts);
      ensure(ip).malformed++;
    } else if ((im = PIKE_RE.exec(content))) {
      const ip = im[1];
      touch(ip, ts);
      ensure(ip).pikeBlocked++;
    } else if ((im = BANNED_DROP_RE.exec(content))) {
      const ip = im[1];
      touch(ip, ts);
      ensure(ip).bannedDrop++;
    }
  }

  return { byIp, minTs, maxTs, totalLines };
}

function classifyBehavior(rec) {
  const behaviors = [];
  if (rec.malformed > 0) behaviors.push('MALFORMED_SIP');
  if (rec.registerDenied >= 3 || rec.distinctRegisterUsers.size >= 3) behaviors.push('REGISTER_BRUTE_FORCE');
  else if (rec.registerAttempt > 0) behaviors.push('REGISTER_ATTEMPT');
  if (rec.invite >= 5 && rec.distinctInviteTargets.size >= 5) behaviors.push('INVITE_SCAN');
  else if (rec.invite > 0) behaviors.push('INVITE');
  if (rec.options >= 3) behaviors.push('OPTIONS_SCAN');
  else if (rec.options > 0) behaviors.push('OPTIONS');
  if (rec.pikeBlocked > 0 || rec.bannedDrop > 0) behaviors.push('FLOOD_TRIPPED_PIKE');
  return behaviors.length ? behaviors : ['UNKNOWN'];
}

function recommend(rec, trust, alreadyBlocked) {
  if (trust.trusted) return { action: 'IGNORE', reason: `matches trusted/carrier ACL (${trust.label})` };
  if (alreadyBlocked) return { action: 'ALREADY_BLOCKED', reason: 'existing DOCKER-USER/INPUT DROP rule found' };

  const total = rec.invite + rec.registerAttempt + rec.options + rec.malformed;
  const highConfidenceFraud =
    rec.malformed >= 3 ||
    rec.distinctRegisterUsers.size >= 3 ||
    (rec.invite >= 15 && rec.distinctInviteTargets.size >= 10) ||
    rec.pikeBlocked > 0 ||
    rec.bannedDrop > 0;

  if (highConfidenceFraud) {
    return { action: 'PERMANENT_BLOCK', reason: 'high-volume/brute-force/malformed pattern, no legitimate traffic observed' };
  }
  if (total >= 3) {
    return { action: 'RATE_LIMIT', reason: 'low/moderate volume scan-like traffic — throttle rather than hard-block (may include benign monitors)' };
  }
  return { action: 'MONITOR', reason: 'too little traffic to classify confidently' };
}

function getExistingBlocks() {
  try {
    const out = execSync("iptables -L DOCKER-USER -n 2>/dev/null | grep -F 'vsp-sip-abuse-block' || true", {
      encoding: 'utf8',
    });
    const ips = new Set();
    for (const line of out.split('\n')) {
      const m = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/.exec(line);
      if (m) ips.add(m[1]);
    }
    return ips;
  } catch {
    return new Set();
  }
}

function main() {
  console.log(`Fetching up to ${HOURS}h of logs from ${CONTAINER} ...`);
  const logText = fetchLogs();
  const { byIp, minTs, maxTs, totalLines } = parse(logText);
  const trustedRanges = loadTrustedRanges();
  const existingBlocks = getExistingBlocks();

  console.log(`\n=== Coverage ===`);
  console.log(`Requested window: ${HOURS}h`);
  console.log(`Log lines scanned: ${totalLines}`);
  console.log(`Actual first timestamp seen: ${minTs ?? '(none)'}`);
  console.log(`Actual last timestamp seen:  ${maxTs ?? '(none)'}`);
  if (minTs && maxTs) {
    const spanMs = Date.parse(maxTs) - Date.parse(minTs);
    const spanH = (spanMs / 3_600_000).toFixed(1);
    console.log(`Actual coverage span: ~${spanH}h`);
    if (Number(spanH) < HOURS * 0.9) {
      console.log(
        `NOTE: actual coverage (${spanH}h) is well short of the requested ${HOURS}h — docker's json-file driver ` +
          `(max-size 10m x max-file 3) has almost certainly rotated out older entries. This report only covers what's on disk now.`,
      );
    }
  }

  const rows = [];
  for (const rec of byIp.values()) {
    const trust = classifyTrust(rec.ip, trustedRanges);
    const alreadyBlocked = existingBlocks.has(rec.ip);
    const behaviors = classifyBehavior(rec);
    const rec2 = recommend(rec, trust, alreadyBlocked);
    const total = rec.invite + rec.registerAttempt + rec.options + rec.malformed;
    rows.push({
      ip: rec.ip,
      total,
      invite: rec.invite,
      registerAttempt: rec.registerAttempt,
      registerDenied: rec.registerDenied,
      distinctRegisterUsers: rec.distinctRegisterUsers.size,
      options: rec.options,
      malformed: rec.malformed,
      pikeBlocked: rec.pikeBlocked,
      firstSeen: rec.firstSeen,
      lastSeen: rec.lastSeen,
      behaviors,
      trust,
      alreadyBlocked,
      recommendation: rec2.action,
      recommendationReason: rec2.reason,
    });
  }

  rows.sort((a, b) => b.total - a.total);

  console.log(`\n=== Top source IPs (${rows.length} distinct) ===`);
  const top = rows.slice(0, 30);
  for (const r of top) {
    console.log(
      `${r.ip.padEnd(16)} total=${String(r.total).padEnd(5)} INVITE=${String(r.invite).padEnd(4)} ` +
        `REG=${String(r.registerAttempt).padEnd(3)}(denied=${r.registerDenied},users=${r.distinctRegisterUsers}) ` +
        `OPT=${String(r.options).padEnd(3)} MALFORMED=${String(r.malformed).padEnd(3)} ` +
        `[${r.behaviors.join(',')}] ` +
        `first=${r.firstSeen} last=${r.lastSeen} ` +
        `=> ${r.recommendation}${r.trust.trusted ? ` (trust=${r.trust.label})` : ''}${r.alreadyBlocked ? ' (already blocked)' : ''}`,
    );
  }

  const permanentBlock = rows.filter((r) => r.recommendation === 'PERMANENT_BLOCK').map((r) => r.ip);
  const rateLimit = rows.filter((r) => r.recommendation === 'RATE_LIMIT').map((r) => r.ip);
  const alreadyBlocked = rows.filter((r) => r.recommendation === 'ALREADY_BLOCKED').map((r) => r.ip);

  console.log(`\n=== Recommendation summary ===`);
  console.log(`PERMANENT_BLOCK (${permanentBlock.length}): ${permanentBlock.join(', ') || '(none)'}`);
  console.log(`RATE_LIMIT      (${rateLimit.length}): ${rateLimit.join(', ') || '(none)'}`);
  console.log(`ALREADY_BLOCKED (${alreadyBlocked.length}): ${alreadyBlocked.join(', ') || '(none)'}`);
  console.log(
    `\nNext: sudo bash scripts/platform/setup-sip-abuse-defense.sh ${permanentBlock.join(' ')}`,
  );

  if (JSON_OUT) {
    fs.writeFileSync(
      JSON_OUT,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), window: `${HOURS}h`, minTs, maxTs, totalLines, rows },
        (k, v) => (v instanceof Set ? [...v] : v),
        2,
      ),
    );
    console.log(`\nWrote ${JSON_OUT}`);
  }
}

main();
