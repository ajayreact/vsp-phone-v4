const fs = require('fs');
const yaml = require('yaml');

const envText = fs.readFileSync('.env', 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i < 0) continue;
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

function expand(s) {
  return String(s).replace(/\$\{([^}:-]+)(?::-([^}]*))?\}/g, (_m, k, d) =>
    env[k] !== undefined && env[k] !== '' ? env[k] : d !== undefined ? d : '',
  );
}

function mergeDeep(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return b;
  if (a && typeof a === 'object' && b && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const o = { ...a };
    for (const k of Object.keys(b)) o[k] = k in a ? mergeDeep(a[k], b[k]) : b[k];
    return o;
  }
  return b === undefined ? a : b;
}

const base = yaml.parse(fs.readFileSync('docker-compose.yml', 'utf8'));
const prod = yaml.parse(fs.readFileSync('docker-compose.prod.yml', 'utf8'));
const host = yaml.parse(fs.readFileSync('docker-compose.host-db.yml', 'utf8'));
const cfg = mergeDeep(mergeDeep(base, prod), host);
const api = cfg.services.api;

const envBlock = {};
for (const [k, v] of Object.entries(api.environment || {})) {
  envBlock[k] = expand(String(v));
}
const effective = { ...env, ...envBlock };

const url = effective.DATABASE_URL || '';
const report = {
  envRaw: {
    DATABASE_URL: env.DATABASE_URL,
    KAMAILIO_HTTP_HOST: env.KAMAILIO_HTTP_HOST,
    RTPENGINE_HOST: env.RTPENGINE_HOST,
    DATABASE_HOST: env.DATABASE_HOST || '<UNSET>',
    POSTGRES_DB: env.POSTGRES_DB,
    POSTGRES_APP_DB: env.POSTGRES_APP_DB || '<UNSET>',
  },
  effective: {
    DATABASE_URL: url.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@'),
    REDIS_URL: effective.REDIS_URL,
    POSTGRES_HOST: effective.POSTGRES_HOST,
    REDIS_HOST: effective.REDIS_HOST,
    KAMAILIO_HTTP_HOST: effective.KAMAILIO_HTTP_HOST,
    KAMAILIO_HTTP_PORT: effective.KAMAILIO_HTTP_PORT,
    RTPENGINE_HOST: effective.RTPENGINE_HOST,
    RTPENGINE_NG_PORT: effective.RTPENGINE_NG_PORT,
    VSP_ENV: effective.VSP_ENV,
    TLS_TERMINATION: effective.TLS_TERMINATION,
  },
  checks: {
    databaseUrlUsesLocalhost: /@(localhost|127\.0\.0\.1):/.test(url),
    databaseUrlUsesVspVoip: /vsp_voip/.test(url),
    databaseUrlHostPostgres: /@postgres:5432\//.test(url),
    databaseUrlDbVspPhoneV4: /\/vsp_phone_v4(\?|$)/.test(url),
    kamailioHostOk: effective.KAMAILIO_HTTP_HOST === 'kamailio',
    rtpengineHostOk: effective.RTPENGINE_HOST === 'rtpengine',
    kamailioDependsOnApi: !!(cfg.services.kamailio.depends_on || {}).api,
    apiDependsOnKamailio: !!(api.depends_on || {}).kamailio,
    postgresDbExpanded: expand(String(cfg.services.postgres.environment.POSTGRES_DB)),
  },
  dependsOn: {
    api: api.depends_on,
    kamailio: cfg.services.kamailio.depends_on,
  },
};

fs.writeFileSync('scripts/platform/compose-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
