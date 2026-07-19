import type { X509Certificate } from 'node:crypto';
import { shortIssuerLabel, summarizeCertificate } from './tls-cert-probe';

describe('tls-cert-probe helpers', () => {
  it("labels Let's Encrypt issuers", () => {
    expect(shortIssuerLabel("Let's Encrypt", "CN=R3,O=Let's Encrypt,C=US")).toBe("Let's Encrypt");
    expect(shortIssuerLabel('DigiCert Inc', 'CN=DigiCert,O=DigiCert Inc')).toBe('DigiCert Inc');
  });

  it('summarizes CN, SAN, issuer, and days remaining', () => {
    const now = Date.now();
    const notBefore = new Date(now - 86_400_000);
    const notAfter = new Date(now + 30 * 86_400_000);

    const stub = {
      subject: 'CN=prov.vspphone.com',
      subjectAltName: 'DNS:prov.vspphone.com, DNS:admin.vspphone.com',
      issuer: "CN=R3,O=Let's Encrypt,C=US",
      validFrom: notBefore.toUTCString(),
      validTo: notAfter.toUTCString(),
    } as unknown as X509Certificate;

    const summary = summarizeCertificate(stub, 12);
    expect(summary.cn).toBe('prov.vspphone.com');
    expect(summary.san).toEqual(['prov.vspphone.com', 'admin.vspphone.com']);
    expect(summary.issuerOrg).toBe("Let's Encrypt");
    expect(summary.daysRemaining).toBeGreaterThanOrEqual(29);
    expect(summary.daysRemaining).toBeLessThanOrEqual(30);
    expect(summary.latencyMs).toBe(12);
    expect(shortIssuerLabel(summary.issuerOrg, summary.issuer)).toBe("Let's Encrypt");
  });
});
