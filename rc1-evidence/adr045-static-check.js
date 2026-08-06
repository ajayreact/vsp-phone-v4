// ADR-045 static pre-deploy assertions. Run from the repo root:  node rc1-evidence/adr045-static-check.js
const y = require('js-yaml');
const fs = require('fs');

let pass = 0;
let fail = 0;
const chk = (name, cond, detail) => {
  console.log((cond ? '[PASS] ' : '[FAIL] ') + name + (detail !== undefined ? '  ' + detail : ''));
  cond ? pass++ : fail++;
};

// ---- compose merge (base + production overlay) ----
const base = y.load(fs.readFileSync('docker-compose.yml', 'utf8'));
const prod = y.load(fs.readFileSync('docker-compose.prod.yml', 'utf8'));
const merged = {};
for (const k of new Set([...Object.keys(base.services), ...Object.keys(prod.services)])) {
  const b = base.services[k] || {};
  const p = prod.services[k] || {};
  merged[k] = { ...b, ...p, environment: { ...(b.environment || {}), ...(p.environment || {}) } };
}
const a = merged.asterisk;
const k = merged.kamailio;

chk('production merge contains the asterisk service', !!a);
chk('asterisk publishes NO host ports', !a.ports, JSON.stringify(a.ports || null));
chk('asterisk restart=always in production', a.restart === 'always', a.restart);
chk('asterisk refuses to start without trunk creds in production',
  String(a.environment.ASTERISK_REQUIRE_TRUNK).includes('1'), a.environment.ASTERISK_REQUIRE_TRUNK);
chk('asterisk attached only to vsp_internal',
  JSON.stringify(a.networks) === JSON.stringify(['vsp_internal']), JSON.stringify(a.networks));
chk('kamailio does not publish the internal 5070 socket',
  !k.ports.some((p) => String(p).includes('5070')), JSON.stringify(k.ports));
chk('kamailio knows the asterisk host', k.environment.ASTERISK_HOST === 'asterisk');
chk('kamailio internal socket port configured',
  !!k.environment.KAMAILIO_INTERNAL_SIP_PORT, k.environment.KAMAILIO_INTERNAL_SIP_PORT);
chk('rtpengine advertise address wired in production', !!merged.rtpengine.environment.RTPENGINE_ADVERTISE);
chk('asterisk config mounted read-only',
  (a.volumes || []).some((v) => v.startsWith('./infrastructure/asterisk:') && v.endsWith(':ro')));

// ---- kamailio.cfg structural checks ----
const cfg = fs.readFileSync('infrastructure/kamailio/kamailio.cfg', 'utf8');
let depth = 0;
let neg = 0;
for (const line of cfg.split('\n')) {
  for (const c of line.replace(/#.*$/, '')) {
    if (c === '{') depth++;
    if (c === '}' && --depth < 0) neg++;
  }
}
chk('kamailio.cfg blocks balanced', depth === 0 && neg === 0, `depth=${depth} negatives=${neg}`);

const routes = [...cfg.matchAll(/^route\[([A-Z_0-9]+)\]/gm)].map((m) => m[1]);
const calls = [...cfg.matchAll(/route\(([A-Z_0-9]+)\)/g)].map((m) => m[1]);
const missing = [...new Set(calls)].filter((c) => !routes.includes(c));
chk('every route() target is defined', missing.length === 0, missing.join(','));

const retired = [
  'CARRIER_RELAY_ACK', 'CARRIER_APPLY_SIG', 'CARRIER_STORE_CONTACT', 'CARRIER_APPLY_ACK_ROUTE',
  'CARRIER_SANITIZE_ACK_DU', 'DESK_NORMALIZE_CARRIER_REPLY', 'uac_req_send', 'uac_auth', 't_suspend',
];
const leftovers = retired.filter((r) => cfg.includes(r));
chk('retired hand-rolled B2BUA machinery fully removed', leftovers.length === 0, leftovers.join(','));

chk('carrier egress route present', cfg.includes('route[CARRIER_EGRESS]'));
chk('desk leg is record-routed', /record_route\(\)/.test(cfg));
chk('egress marker gated on the internal socket', cfg.includes('$Rp != KAM_SIP_INT_PORT'));
chk('internal listen socket declared', /listen=udp:0\.0\.0\.0:__KAMAILIO_INTERNAL_SIP_PORT__/.test(cfg));

// Every placeholder in the config must be rendered by the kamailio entrypoint.
const entry = fs.readFileSync('infrastructure/docker/kamailio/docker-entrypoint.sh', 'utf8');
const placeholders = [...new Set([...cfg.matchAll(/__[A-Z_]+__/g)].map((m) => m[0]))];
const unrendered = placeholders.filter((p) => !entry.includes(p));
chk('every kamailio.cfg placeholder is rendered by the entrypoint', unrendered.length === 0, unrendered.join(','));

// ---- asterisk config placeholders ----
const astEntry = fs.readFileSync('infrastructure/docker/asterisk/docker-entrypoint.sh', 'utf8');
const astPlaceholders = new Set();
for (const f of fs.readdirSync('infrastructure/asterisk')) {
  const t = fs.readFileSync(`infrastructure/asterisk/${f}`, 'utf8');
  for (const m of t.matchAll(/__[A-Z_]+__/g)) astPlaceholders.add(m[0]);
}
const astUnrendered = [...astPlaceholders].filter((p) => !astEntry.includes(p));
chk('every asterisk config placeholder is rendered by its entrypoint',
  astUnrendered.length === 0, astUnrendered.join(','));

const pjsip = fs.readFileSync('infrastructure/asterisk/pjsip.conf', 'utf8');
chk('pjsip escapes the ;lr parameter on outbound_proxy', /outbound_proxy=sip:.*\\;lr/.test(pjsip));
chk('pjsip telnyx endpoint has outbound_auth', /outbound_auth=telnyx-auth/.test(pjsip));
chk('pjsip transport binds the internal port only',
  /bind=0\.0\.0\.0:__ASTERISK_SIP_PORT__/.test(pjsip));

// Debian removed the asterisk package before bookworm released (bug #1031046) and never
// restored it, so a Debian base silently breaks the build.
const astDockerfile = fs.readFileSync('infrastructure/docker/Dockerfile.asterisk', 'utf8');
chk('asterisk image base still ships an asterisk package',
  /^FROM ubuntu:/m.test(astDockerfile), (astDockerfile.match(/^FROM .*/m) || [])[0]);
chk('asterisk build verifies chan_pjsip is present', astDockerfile.includes('chan_pjsip.so'));

// Ubuntu uses a multiarch libdir; a hardcoded astmoddir loads zero modules.
const astConf = fs.readFileSync('infrastructure/asterisk/asterisk.conf', 'utf8');
chk('astmoddir is detected at start-up, not hardcoded',
  /astmoddir => __ASTERISK_MODULE_DIR__/.test(astConf));

const rtpconf = fs.readFileSync('infrastructure/rtpengine/rtpengine.conf', 'utf8');
chk('rtpengine declares both logical interfaces',
  /interface = internal\//.test(rtpconf) && /interface = external\//.test(rtpconf));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
