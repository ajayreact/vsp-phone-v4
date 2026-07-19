import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadHttpsOptions, loadProvHttpsOptions, resolveApiTlsPaths } from './tls.options';

describe('tls.options production bootstrap', () => {
  let dir: string;
  let cert: string;
  let key: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vsp-tls-'));
    cert = join(dir, 'fullchain.pem');
    key = join(dir, 'privkey.pem');
    writeFileSync(cert, 'CERT');
    writeFileSync(key, 'KEY');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns undefined when TLS_ENABLED=false (nginx edge)', () => {
    expect(
      loadHttpsOptions({
        NODE_ENV: 'production',
        VSP_ENV: 'production',
        TLS_ENABLED: 'false',
        TLS_TERMINATION: 'nginx',
        TLS_API_CERT_FILE: '/app/infrastructure/tls/development/live/api/fullchain.pem',
        TLS_API_KEY_FILE: '/app/infrastructure/tls/development/live/api/privkey.pem',
      }),
    ).toBeUndefined();
  });

  it('returns undefined when TLS_TERMINATION=nginx even if TLS_ENABLED=true', () => {
    expect(
      loadHttpsOptions({
        NODE_ENV: 'production',
        TLS_ENABLED: 'true',
        TLS_TERMINATION: 'nginx',
        TLS_API_CERT_FILE: cert,
        TLS_API_KEY_FILE: key,
      }),
    ).toBeUndefined();
  });

  it('remaps development cert paths to /etc/vsp defaults in production resolution', () => {
    const paths = resolveApiTlsPaths({
      NODE_ENV: 'production',
      VSP_ENV: 'production',
      TLS_API_CERT_FILE: '/app/infrastructure/tls/development/live/api/fullchain.pem',
      TLS_API_KEY_FILE: './infrastructure/tls/development/live/api/privkey.pem',
    });
    expect(paths.certPath.replace(/\\/g, '/')).toContain('/etc/vsp/tls/api/fullchain.pem');
    expect(paths.keyPath.replace(/\\/g, '/')).toContain('/etc/vsp/tls/api/privkey.pem');
  });

  it('accepts SSL_CERT_PATH / SSL_KEY_PATH aliases', () => {
    const opts = loadHttpsOptions({
      NODE_ENV: 'development',
      TLS_ENABLED: 'true',
      SSL_CERT_PATH: cert,
      SSL_KEY_PATH: key,
    });
    expect(opts?.cert).toBeTruthy();
    expect(opts?.key).toBeTruthy();
  });

  it('loads Nest HTTPS when TLS_ENABLED=true and production cert files exist', () => {
    const opts = loadHttpsOptions({
      NODE_ENV: 'production',
      VSP_ENV: 'production',
      TLS_ENABLED: 'true',
      TLS_API_CERT_FILE: cert,
      TLS_API_KEY_FILE: key,
    });
    expect(opts).toBeDefined();
    expect(Buffer.isBuffer(opts?.cert)).toBe(true);
  });

  it('fails only when TLS_ENABLED=true and production cert files are missing', () => {
    expect(() =>
      loadHttpsOptions({
        NODE_ENV: 'production',
        VSP_ENV: 'production',
        TLS_ENABLED: 'true',
        TLS_API_CERT_FILE: '/etc/vsp/tls/api/fullchain.pem',
        TLS_API_KEY_FILE: '/etc/vsp/tls/api/privkey.pem',
      }),
    ).toThrow(/TLS certificate files not found/);
  });

  it('allows development cert paths when not production', () => {
    const opts = loadHttpsOptions({
      NODE_ENV: 'development',
      VSP_ENV: 'development',
      TLS_ENABLED: 'true',
      TLS_API_CERT_FILE: cert,
      TLS_API_KEY_FILE: key,
    });
    expect(opts).toBeDefined();
  });

  it('loads prov HTTPS from explicit production PEM paths', () => {
    const opts = loadProvHttpsOptions({
      NODE_ENV: 'production',
      VSP_ENV: 'production',
      PROV_HTTPS_ENABLED: 'true',
      TLS_PROV_CERT_FILE: cert,
      TLS_PROV_KEY_FILE: key,
    });
    expect(opts).toBeDefined();
    expect(Buffer.isBuffer(opts?.cert)).toBe(true);
  });

  it('rejects development prov PEM paths in production when files missing at defaults', () => {
    expect(() =>
      loadProvHttpsOptions({
        NODE_ENV: 'production',
        VSP_ENV: 'production',
        PROV_HTTPS_ENABLED: 'true',
        TLS_PROV_CERT_FILE: './infrastructure/tls/development/live/prov/fullchain.pem',
        TLS_PROV_KEY_FILE: './infrastructure/tls/development/live/prov/privkey.pem',
      }),
    ).toThrow(/Provisioning TLS files not found/);
  });
});
