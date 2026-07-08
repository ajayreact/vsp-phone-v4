import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HttpsOptions } from '@nestjs/common/interfaces/external/https-options.interface';

/**
 * Optional HTTPS bootstrap for NestJS (Phase 2).
 * Enabled when TLS_ENABLED=true and certificate files resolve.
 */
export function loadHttpsOptions(env: NodeJS.ProcessEnv = process.env): HttpsOptions | undefined {
  const enabled = (env.TLS_ENABLED ?? 'false').toLowerCase() === 'true';
  if (!enabled) {
    return undefined;
  }

  const certPath = resolve(env.TLS_API_CERT_FILE ?? '');
  const keyPath = resolve(env.TLS_API_KEY_FILE ?? '');
  const caPath = env.TLS_CA_FILE ? resolve(env.TLS_CA_FILE) : undefined;

  if (!certPath || !keyPath) {
    throw new Error('TLS_ENABLED=true requires TLS_API_CERT_FILE and TLS_API_KEY_FILE');
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

  const certPath = resolve(env.TLS_PROV_CERT_FILE ?? '');
  const keyPath = resolve(env.TLS_PROV_KEY_FILE ?? '');
  const caPath = env.TLS_CA_FILE ? resolve(env.TLS_CA_FILE) : undefined;

  if (!certPath || !keyPath) {
    throw new Error('PROV_HTTPS_ENABLED requires TLS_PROV_CERT_FILE and TLS_PROV_KEY_FILE');
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
