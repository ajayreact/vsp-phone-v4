import { isKamailioAorResolvedTelecomPath } from './telecom-authorization.service';

describe('isKamailioAorResolvedTelecomPath', () => {
  it('exempts Kamailio REGISTER and call-plane paths from body tenantId enforcement', () => {
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/auth/sip-digest')).toBe(true);
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/authenticate')).toBe(true);
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/register')).toBe(true);
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/unregister')).toBe(true);
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/routing/resolve')).toBe(true);
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/route')).toBe(true);
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/routing/continue')).toBe(true);
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/call/start')).toBe(true);
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/media/lifecycle')).toBe(true);
  });

  it('still enforces tenant on non-Kamailio telecom paths', () => {
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/presence')).toBe(false);
    expect(isKamailioAorResolvedTelecomPath('/api/v1/telecom/device')).toBe(false);
  });
});
