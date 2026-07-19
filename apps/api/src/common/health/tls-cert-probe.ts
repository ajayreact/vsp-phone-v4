import { X509Certificate } from 'node:crypto';
import tls from 'node:tls';

export type RemoteTlsCertificate = {
  cn: string;
  san: string[];
  issuer: string;
  issuerOrg: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  latencyMs: number;
};

/** Fetch the leaf certificate currently served on host:port (SNI = host). */
export function fetchRemoteTlsCertificate(
  host: string,
  port = 443,
  timeoutMs = 5000,
): Promise<RemoteTlsCertificate> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host,
      port,
      servername: host,
      // Health probe: we report cert contents even if chain trust is incomplete in-container.
      rejectUnauthorized: false,
    });

    const finish = (err?: Error, cert?: RemoteTlsCertificate) => {
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      if (err) reject(err);
      else if (cert) resolve(cert);
      else reject(new Error('certificate missing'));
    };

    const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);

    socket.once('secureConnect', () => {
      try {
        const x509 =
          typeof socket.getPeerX509Certificate === 'function'
            ? socket.getPeerX509Certificate()
            : null;
        if (!x509) {
          finish(new Error('no peer certificate'));
          return;
        }
        finish(undefined, summarizeCertificate(x509, Date.now() - started));
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    });

    socket.once('error', (err) => finish(err));
  });
}

export function summarizeCertificate(
  x509: X509Certificate,
  latencyMs = 0,
): RemoteTlsCertificate {
  const cn = extractCn(x509.subject) || extractCn(x509.subjectAltName ?? '') || 'unknown';
  const san = parseSan(x509.subjectAltName);
  const issuer = x509.issuer;
  const issuerOrg = extractOrg(issuer) || issuer;
  const validTo = new Date(x509.validTo);
  const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);

  return {
    cn,
    san,
    issuer,
    issuerOrg,
    validFrom: new Date(x509.validFrom).toISOString(),
    validTo: validTo.toISOString(),
    daysRemaining,
    latencyMs,
  };
}

export function shortIssuerLabel(issuerOrg: string, issuer: string): string {
  const hay = `${issuerOrg} ${issuer}`.toLowerCase();
  if (hay.includes("let's encrypt") || hay.includes('letsencrypt')) return "Let's Encrypt";
  return issuerOrg.trim() || 'Unknown issuer';
}

function extractCn(subject: string): string {
  const match = /(?:^|,\s*)(?:CN|DNS)=([^,]+)/i.exec(subject);
  return match?.[1]?.trim() ?? '';
}

function extractOrg(issuer: string): string {
  const match = /(?:^|,\s*)O=([^,]+)/i.exec(issuer);
  return match?.[1]?.trim() ?? '';
}

function parseSan(subjectAltName: string | undefined): string[] {
  if (!subjectAltName?.trim()) return [];
  return subjectAltName
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('DNS:'))
    .map((part) => part.slice(4).trim())
    .filter(Boolean);
}
