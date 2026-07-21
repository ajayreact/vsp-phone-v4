import {
  decryptProvHttpPassword,
  deriveProvHttpCredentialKey,
  encryptProvHttpPassword,
} from './prov-http-credential.crypto';

describe('prov-http-credential.crypto', () => {
  const key = deriveProvHttpCredentialKey('test-secret');

  it('round-trips password encryption', () => {
    const password = 'base64url-password-123';
    const encrypted = encryptProvHttpPassword(password, key);
    expect(encrypted).not.toContain(password);
    expect(decryptProvHttpPassword(encrypted, key)).toBe(password);
  });

  it('derives stable keys for the same secret', () => {
    const a = deriveProvHttpCredentialKey('same-secret');
    const b = deriveProvHttpCredentialKey('same-secret');
    expect(a.equals(b)).toBe(true);
  });
});
