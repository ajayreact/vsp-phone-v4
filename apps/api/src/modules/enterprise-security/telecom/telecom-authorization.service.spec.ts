import { isKamailioAorResolvedTelecomPath } from './telecom-authorization.service';

describe('isKamailioAorResolvedTelecomPath', () => {
  it('exempts Kamailio REGISTER auth paths from body tenantId enforcement', () => {
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/auth/sip-digest')).toBe(true);
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/authenticate')).toBe(true);
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/register')).toBe(true);
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/unregister')).toBe(true);
  });

  it('still enforces tenant on routing and call paths', () => {
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/routing/resolve')).toBe(false);
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/call/start')).toBe(false);
  });
});
