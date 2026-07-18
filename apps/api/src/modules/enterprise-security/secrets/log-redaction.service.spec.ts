import { redactLogMessage } from './log-redaction.service';

describe('redactLogMessage', () => {
  it('is null-safe for undefined and null (JSON.stringify(undefined) is undefined)', () => {
    expect(redactLogMessage(undefined)).toBe('');
    expect(redactLogMessage(null)).toBe('');
  });

  it('redacts bearer tokens in strings', () => {
    expect(redactLogMessage('Authorization: Bearer abc.def.ghi')).toContain('[REDACTED]');
  });

  it('handles objects without throwing', () => {
    expect(() => redactLogMessage({ password: 'secret', ok: true })).not.toThrow();
    expect(redactLogMessage({ password: 'secret' })).toContain('[REDACTED]');
  });
});
