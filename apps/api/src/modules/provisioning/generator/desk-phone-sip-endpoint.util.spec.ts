import { resolveDeskPhoneSipEndpoint } from './desk-phone-sip-endpoint.util';

describe('resolveDeskPhoneSipEndpoint', () => {
  it('defaults UDP desk phones to port 5060 even when SIP_PORT is 5061', () => {
    expect(resolveDeskPhoneSipEndpoint({ configuredPort: 5061 })).toEqual({
      port: 5060,
      grandstreamTransport: 0,
    });
  });

  it('uses TLS on 5061 when transport is TLS', () => {
    expect(resolveDeskPhoneSipEndpoint({ transport: 'TLS', configuredPort: 5061 })).toEqual({
      port: 5061,
      grandstreamTransport: 2,
    });
  });

  it('uses TCP on the configured port when transport is TCP', () => {
    expect(resolveDeskPhoneSipEndpoint({ transport: 'TCP', configuredPort: 5060 })).toEqual({
      port: 5060,
      grandstreamTransport: 1,
    });
  });
});
