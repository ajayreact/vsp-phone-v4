import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HttpsOptions } from '@nestjs/common/interfaces/external/https-options.interface';

const PROD_API_CERT_DEFAULT = '/etc/vsp/tls/api/fullchain.pem';
const PROD_API_KEY_DEFAULT = '/etc/vsp/tls/api/privkey.pem';

function isProductionRuntime(env: NodeJS.ProcessEnv): boolean {
  const nodeEnv = (env.NODE_ENV ?? '').toLowerCase();
  const vspEnv = (env.VSP_ENV ?? '').toLowerCase();
  return nodeEnv === 'production' || vspEnv === 'production';
}

function isTruthy(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value.toLowerCase() === 'true';
}

/** True when Nest must not bind HTTPS (edge/nginx terminates TLS). */
export function isEdgeTlsTermination(env: NodeJS.ProcessEnv = process.env): boolean {
  const termination = (env.TLS_TERMINATION ?? '').toLowerCase().trim();
  if (termination === 'nginx' || termination === 'edge' || termination === 'external') {
    return true;
  }
  // Explicit plain HTTP when TLS_ENABLED=false
  return !isTruthy(env.TLS_ENABLED, false);
}

function isDevelopmentTlsPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  return (
    normalized.includes('/infrastructure/tls/development/') ||
    normalized.includes('/tls/development/') ||
    normalized.includes('tls\\development\\')
  );
}

/**
 * Resolve API certificate paths.
 * Production never falls back to repository development certs.
 * Aliases: SSL_CERT_PATH / SSL_KEY_PATH → TLS_API_CERT_FILE / TLS_API_KEY_FILE.
 */
export function resolveApiTlsPaths(env: NodeJS.ProcessEnv = process.env): {
  certPath: string;
  keyPath: string;
  caPath?: string;
} {
  const production = isProductionRuntime(env);
  let certRaw = (env.TLS_API_CERT_FILE || env.SSL_CERT_PATH || '').trim();
  let keyRaw = (env.TLS_API_KEY_FILE || env.SSL_KEY_PATH || '').trim();

  if (production) {
    if (!certRaw || isDevelopmentTlsPath(certRaw)) {
      certRaw = PROD_API_CERT_DEFAULT;
    }
    if (!keyRaw || isDevelopmentTlsPath(keyRaw)) {
      keyRaw = PROD_API_KEY_DEFAULT;
    }
  }

  const certPath = certRaw ? resolve(certRaw) : '';
  const keyPath = keyRaw ? resolve(keyRaw) : '';
  const caRaw = (env.TLS_CA_FILE || '').trim();
  const caPath = caRaw ? resolve(caRaw) : undefined;

  if (production && (isDevelopmentTlsPath(certPath) || isDevelopmentTlsPath(keyPath))) {
    throw new Error(
      'Production must not use development TLS certificate paths. ' +
        'Set TLS_API_CERT_FILE/TLS_API_KEY_FILE (or SSL_CERT_PATH/SSL_KEY_PATH) to production mounts ' +
        `(e.g. ${PROD_API_CERT_DEFAULT}), or set TLS_ENABLED=false and TLS_TERMINATION=nginx when nginx terminates HTTPS.`,
    );
  }

  return { certPath, keyPath, caPath };
}

/**
 * Optional HTTPS bootstrap for NestJS.
 * - TLS_ENABLED=false or TLS_TERMINATION=nginx|edge → plain HTTP (no cert load)
 * - TLS_ENABLED=true → require configured production/dev cert files to exist
 * Production never loads /infrastructure/tls/development/...
 */
export function loadHttpsOptions(env: NodeJS.ProcessEnv = process.env): HttpsOptions | undefined {
  if (isEdgeTlsTermination(env)) {
    return undefined;
  }

  // Nest HTTPS only when explicitly enabled
  if (!isTruthy(env.TLS_ENABLED, false)) {
    return undefined;
  }

  const { certPath, keyPath, caPath } = resolveApiTlsPaths(env);

  if (!certPath || !keyPath) {
    throw new Error(
      'TLS_ENABLED=true requires TLS_API_CERT_FILE and TLS_API_KEY_FILE (or SSL_CERT_PATH and SSL_KEY_PATH)',
    );
  }
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    throw new Error(`TLS certificate files not found: cert=${certPath} key=${keyPath}`);
  }

  const options: HttpsOptions = {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
  };
  if (caPath && existsSync(caPath)) {
    options.ca = readFileSync(caPath);
  }
  return options;
}

/** Phase 11 — provisioning edge HTTPS (ADR-042). */
export function loadProvHttpsOptions(env: NodeJS.ProcessEnv = process.env): HttpsOptions | undefined {
  const enabled = (env.PROV_HTTPS_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (!enabled) {
    return undefined;
  }

  const production = isProductionRuntime(env);
  let certRaw = (env.TLS_PROV_CERT_FILE || '').trim();
  let keyRaw = (env.TLS_PROV_KEY_FILE || '').trim();

  if (production) {
    if (!certRaw || isDevelopmentTlsPath(certRaw)) {
      certRaw = '/etc/vsp/tls/prov/fullchain.pem';
    }
    if (!keyRaw || isDevelopmentTlsPath(keyRaw)) {
      keyRaw = '/etc/vsp/tls/prov/privkey.pem';
    }
  }

  const certPath = certRaw ? resolve(certRaw) : '';
  const keyPath = keyRaw ? resolve(keyRaw) : '';
  const caPath = env.TLS_CA_FILE ? resolve(env.TLS_CA_FILE) : undefined;

  if (!certPath || !keyPath) {
    throw new Error('PROV_HTTPS_ENABLED requires TLS_PROV_CERT_FILE and TLS_PROV_KEY_FILE');
  }
  if (production && (isDevelopmentTlsPath(certPath) || isDevelopmentTlsPath(keyPath))) {
    throw new Error('Production must not use development provisioning TLS paths');
  }
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    throw new Error(`Provisioning TLS files not found: cert=${certPath} key=${keyPath}`);
  }

  const options: HttpsOptions = {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
  };
  if (caPath && existsSync(caPath)) {
    options.ca = readFileSync(caPath);
  }
  return options;
}
