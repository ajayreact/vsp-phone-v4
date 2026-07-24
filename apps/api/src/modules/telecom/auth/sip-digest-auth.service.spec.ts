import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantStatus } from '@prisma/client';
import { SipDigestAuthService } from './sip-digest-auth.service';
import { computeDigestResponse, computeHa1 } from './sip-digest.crypto';
import type { AuthenticateRequestDto } from '../dto/telecom.request.dto';

describe('SipDigestAuthService', () => {
  const endpointId = 'ep-1';
  const deviceId = 'dev-1';
  const tenantId = 'tenant-1';
  const password = 'desk-sip-secret';
  const authUsername = '100';
  const tenantRealm = 'vsp-internal.sip.vspphone.com';
  const registrarRealm = 'sip.vspphone.com';

  const endpoint = {
    id: endpointId,
    tenantId,
    authUsername,
    aor: `sip:${authUsername}@${tenantRealm}`,
    tenant: { slug: 'vsp-internal', status: TenantStatus.ACTIVE },
    devices: [
      {
        id: deviceId,
        lineId: 'line-1',
        deletedAt: null,
        assignments: [{ tenantId, lineId: 'line-1', deletedAt: null, effectiveTo: null }],
      },
    ],
  };

  function buildDto(realm: string): AuthenticateRequestDto {
    const nonce = 'abc123';
    const uri = `sip:${registrarRealm}`;
    const ha1 = computeHa1(authUsername, realm, password);
    const response = computeDigestResponse({
      ha1,
      nonce,
      method: 'REGISTER',
      uri,
    });
    return {
      aor: `sip:${authUsername}@${registrarRealm}`,
      username: authUsername,
      realm,
      nonce,
      response,
      method: 'REGISTER',
      uri,
      srcIp: '203.0.113.10',
    };
  }

  function createService(overrides?: {
    registrarHost?: string;
    rehydrate?: boolean;
  }) {
    const prisma = {
      connected: true,
      sIPEndpoint: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue(endpoint),
      },
    };
    const vault = {
      rehydrateDeskCredential: jest.fn().mockResolvedValue(overrides?.rehydrate ?? true),
      peekEnroll: jest.fn().mockReturnValue(null),
      peekPersistentVersion: jest.fn().mockReturnValue('desk-1'),
      resolveHa1Candidates: jest.fn().mockImplementation(async ({ realm }: { realm: string }) => [
        {
          sipEndpointId: endpointId,
          ha1: computeHa1(authUsername, realm, password),
          passwordVersion: 'desk-1',
          source: 'redis' as const,
        },
      ]),
      resolveHa1: jest.fn().mockImplementation(async ({ realm }: { realm: string }) => ({
        sipEndpointId: endpointId,
        ha1: computeHa1(authUsername, realm, password),
        passwordVersion: 'desk-1',
        source: 'redis' as const,
      })),
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue(undefined),
      authCacheKey: jest.fn().mockReturnValue('cache-key'),
    };
    const events = new EventEmitter2();
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'SIP_PLATFORM_DOMAIN') return 'vspphone.com';
        if (key === 'SIP_REGISTRAR_HOST') return overrides?.registrarHost ?? 'sip.vspphone.com';
        if (key === 'SIP_DEFAULT_EXPIRES_SEC') return '3600';
        return fallback;
      }),
    };

    const service = new SipDigestAuthService(
      prisma as never,
      vault as never,
      redis as never,
      events,
      config as never,
    );
    return { service, vault, prisma };
  }

  it('allows desk REGISTER digest when challenge realm is SIP_REGISTRAR_HOST', async () => {
    const { service } = createService();
    const result = await service.authenticate(buildDto(registrarRealm), {
      requestId: 'req-1',
      correlationId: 'corr-1',
      idempotencyKey: 'idem-1',
    });
    expect(result.allow).toBe(true);
    expect(result.deviceId).toBe(deviceId);
    expect(result.tenantId).toBe(tenantId);
  });

  it('denies when registrar host is not configured and realm is bare registrar FQDN', async () => {
    const { service } = createService({ registrarHost: '' });
    const result = await service.authenticate(buildDto(registrarRealm), {
      requestId: 'req-2',
      correlationId: 'corr-2',
      idempotencyKey: 'idem-2',
    });
    expect(result.allow).toBe(false);
  });
});
