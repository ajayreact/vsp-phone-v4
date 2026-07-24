import { LineStatus } from '@prisma/client';
import { RoutingService } from './routing.service';

describe('RoutingService.resolveLineByAorOrExtension (caller lookup)', () => {
  const tenantId = 'c8b74757-5846-42f7-ae0f-d61a31d1fd1f';
  const lineId = '9b43f21b-4ad0-49a1-ab08-dd222848f5ff';
  const endpointId = '1f72c201-613a-4988-ba32-c93bce9c6249';
  const canonicalAor = 'sip:100@vsp-internal.sip.vspphone.com';
  const registrarFrom = 'sip:100@sip.vspphone.com';

  const activeLine = {
    id: lineId,
    tenantId,
    status: LineStatus.ACTIVE,
    callPolicy: { inboundEnabled: true, outboundEnabled: true },
    callerId: { callerIdName: 'Ext 100', phoneNumber: { number: '+13136506292' } },
    extension: { extension: '100' },
    devices: [
      {
        id: '77cb3067-bbd5-40bd-899d-073d58de6546',
        status: 'REGISTERED',
        deletedAt: null,
        sipEndpoint: { aor: canonicalAor },
      },
    ],
  };

  function buildService(opts?: { findByAor?: unknown; findByAuth?: unknown; findExt?: unknown }) {
    const prisma = {
      connected: true,
      sIPEndpoint: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(opts?.findByAor ?? null)
          .mockResolvedValueOnce(
            opts?.findByAuth ?? {
              id: endpointId,
              aor: canonicalAor,
              authUsername: '100',
              line: activeLine,
              devices: [{ line: activeLine }],
            },
          ),
      },
      extension: {
        findFirst: jest.fn().mockResolvedValue(opts?.findExt ?? null),
      },
    };
    const service = new RoutingService(
      prisma as never,
      { get: jest.fn(), setex: jest.fn(), hgetall: jest.fn(), registrationKey: jest.fn() } as never,
      { emit: jest.fn() } as never,
      { validateCli: jest.fn(), selectOutboundTrunk: jest.fn() } as never,
      { evaluateRouteRecording: jest.fn() } as never,
      { resolveAppDestination: jest.fn().mockResolvedValue(null) } as never,
      { resolveFeature: jest.fn().mockResolvedValue(null) } as never,
    );
    return { service, prisma };
  }

  it('resolves desk outbound caller when From uses SIP_REGISTRAR_HOST not DB AoR host', async () => {
    const { service, prisma } = buildService();

    const ctx = await (
      service as unknown as {
        resolveLineByAorOrExtension: (
          a: string,
          u: string,
          t?: string,
        ) => Promise<{ lineId: string; tenantId: string; aor?: string } | null>;
      }
    ).resolveLineByAorOrExtension(registrarFrom, '100');

    expect(ctx?.lineId).toBe(lineId);
    expect(ctx?.tenantId).toBe(tenantId);
    expect(ctx?.aor).toBe(canonicalAor);
    expect(prisma.sIPEndpoint.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.sIPEndpoint.findFirst.mock.calls[0][0].where.aor.equals).toBe(registrarFrom);
    expect(prisma.sIPEndpoint.findFirst.mock.calls[1][0].where.authUsername).toBe('100');
  });
});
