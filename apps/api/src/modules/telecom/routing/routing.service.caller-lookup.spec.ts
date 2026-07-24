import { LineStatus, DeviceStatus } from '@prisma/client';
import { RoutingService } from './routing.service';
import type { RouteRequestDto } from '../dto/telecom.request.dto';

/**
 * Caller line resolution regressions for desk→PSTN (CALLER_LINE_NOT_FOUND).
 * Covers AoR exact match, registrar-host mismatch → authUsername, extension
 * fallback, and unknown caller reject.
 */
describe('RoutingService caller line lookup', () => {
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
        status: DeviceStatus.REGISTERED,
        deletedAt: null,
        sipEndpoint: { aor: canonicalAor },
      },
    ],
  };

  const canonicalEndpoint = {
    id: endpointId,
    aor: canonicalAor,
    authUsername: '100',
    line: activeLine,
    devices: [{ line: activeLine }],
  };

  type LookupOpts = {
    /** Exact AoR hit (canonical DB AoR) */
    byAor?: typeof canonicalEndpoint | null;
    /** authUsername hit */
    byAuthUsername?: typeof canonicalEndpoint | null;
    /** Extension row with line */
    byExtension?: { line: typeof activeLine } | null;
  };

  function buildService(opts: LookupOpts = {}) {
    const byAor = opts.byAor === undefined ? null : opts.byAor;
    const byAuth = opts.byAuthUsername === undefined ? null : opts.byAuthUsername;
    const byExt = opts.byExtension === undefined ? null : opts.byExtension;

    const prisma = {
      connected: true,
      sIPEndpoint: {
        findFirst: jest.fn().mockImplementation(async (args: { where: Record<string, unknown> }) => {
          if (args.where.aor) return byAor;
          if (args.where.authUsername) return byAuth;
          return null;
        }),
      },
      extension: {
        findFirst: jest.fn().mockResolvedValue(byExt),
      },
      tenant: {
        findFirst: jest.fn().mockResolvedValue({
          id: tenantId,
          status: 'ACTIVE',
          deletedAt: null,
        }),
      },
      callSession: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue(undefined),
      hgetall: jest.fn().mockResolvedValue({}),
      registrationKey: jest.fn((t: string, a: string) => `vsp:${t}:reg:${a}`),
      routeIdempotencyKey: jest.fn((k: string) => `vsp:route:idem:${k}`),
      callRuntimeKey: jest.fn((t: string, p: string) => `vsp:${t}:call:${p}`),
      corrSipKey: jest.fn((t: string, c: string) => `vsp:${t}:corr:sip:${c}`),
      corrPlatformKey: jest.fn((t: string, p: string) => `vsp:${t}:corr:platform:${p}`),
    };

    const carriers = {
      validateCli: jest.fn().mockResolvedValue({
        ok: true,
        number: '+13136506292',
        phoneNumberId: 'pn-1',
      }),
      selectOutboundTrunk: jest.fn().mockResolvedValue({
        carrierCode: 'telnyx',
        sipHost: 'sip.telnyx.com',
        sipPort: 5060,
        transport: 'UDP',
        dispatcherSet: 2,
      }),
    };

    const service = new RoutingService(
      prisma as never,
      redis as never,
      { emit: jest.fn() } as never,
      carriers as never,
      {
        evaluateRouteRecording: jest.fn().mockResolvedValue({ enabled: false, pauseAllowed: false }),
      } as never,
      { resolveAppDestination: jest.fn().mockResolvedValue(null) } as never,
      { resolveFeature: jest.fn().mockResolvedValue(null) } as never,
    );

    return { service, prisma, carriers };
  }

  function resolveLine(
    service: RoutingService,
    aorOrUri: string,
    userPart: string | null,
  ) {
    return (
      service as unknown as {
        resolveLineByAorOrExtension: (
          a: string,
          u: string | null,
          t?: string,
        ) => Promise<{ lineId: string; tenantId: string; aor?: string; extension?: string } | null>;
      }
    ).resolveLineByAorOrExtension(aorOrUri, userPart);
  }

  const meta = {
    requestId: 'req-caller-lookup',
    correlationId: 'corr-caller-lookup',
    idempotencyKey: 'idem-caller-lookup',
  };

  it('1) resolves caller by exact SIPEndpoint AoR match', async () => {
    const { service, prisma } = buildService({ byAor: canonicalEndpoint });

    const ctx = await resolveLine(service, canonicalAor, '100');

    expect(ctx?.lineId).toBe(lineId);
    expect(ctx?.tenantId).toBe(tenantId);
    expect(ctx?.aor).toBe(canonicalAor);
    expect(prisma.sIPEndpoint.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.sIPEndpoint.findFirst.mock.calls[0][0].where.aor.equals).toBe(canonicalAor);
    expect(prisma.extension.findFirst).not.toHaveBeenCalled();
  });

  it('2) resolves caller when From AoR host is SIP_REGISTRAR_HOST but DB AoR uses tenant realm (authUsername)', async () => {
    const { service, prisma } = buildService({
      byAor: null,
      byAuthUsername: canonicalEndpoint,
    });

    const ctx = await resolveLine(service, registrarFrom, '100');

    expect(ctx?.lineId).toBe(lineId);
    expect(ctx?.tenantId).toBe(tenantId);
    expect(ctx?.aor).toBe(canonicalAor);
    expect(prisma.sIPEndpoint.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.sIPEndpoint.findFirst.mock.calls[0][0].where.aor.equals).toBe(registrarFrom);
    expect(prisma.sIPEndpoint.findFirst.mock.calls[1][0].where.authUsername).toBe('100');
    expect(prisma.extension.findFirst).not.toHaveBeenCalled();
  });

  it('3) falls back to Extension when AoR and authUsername miss', async () => {
    const { service, prisma } = buildService({
      byAor: null,
      byAuthUsername: null,
      byExtension: { line: activeLine },
    });

    const ctx = await resolveLine(service, 'sip:100@unknown.example', '100');

    expect(ctx?.lineId).toBe(lineId);
    expect(ctx?.tenantId).toBe(tenantId);
    expect(ctx?.extension).toBe('100');
    expect(prisma.sIPEndpoint.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.extension.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.extension.findFirst.mock.calls[0][0].where.extension).toBe('100');
  });

  it('4) unknown caller on outbound returns CALLER_LINE_NOT_FOUND (tenantId unknown)', async () => {
    const { service, prisma, carriers } = buildService({
      byAor: null,
      byAuthUsername: null,
      byExtension: null,
    });

    const dto: RouteRequestDto = {
      callerAor: 'sip:999@sip.vspphone.com',
      from: 'sip:999@sip.vspphone.com',
      requestUri: 'sip:+15551234567@sip.vspphone.com',
      to: 'sip:+15551234567@sip.vspphone.com',
      callId: 'call-unknown-caller',
      intentHint: 'OUTBOUND',
      cli: '999',
    };

    const plan = await service.resolve(dto, meta);

    expect(plan.callIntent).toBe('OUTBOUND');
    // HTTP plan leaves tenantId unset; call.rejected event uses "unknown" (rejectPlan).
    expect(plan.tenantId).toBeUndefined();
    expect(plan.actions).toEqual([
      expect.objectContaining({
        type: 'REJECT',
        target: 'CALLER_LINE_NOT_FOUND',
        rejectCode: 404,
        rejectReason: 'CALLER_LINE_NOT_FOUND',
      }),
    ]);
    expect(carriers.selectOutboundTrunk).not.toHaveBeenCalled();
    expect(prisma.callSession.create).not.toHaveBeenCalled();
  });

  it('outbound desk→PSTN succeeds after authUsername fallback (integration of resolve path)', async () => {
    const { service, carriers } = buildService({
      byAor: null,
      byAuthUsername: canonicalEndpoint,
    });

    const dto: RouteRequestDto = {
      callerAor: registrarFrom,
      from: registrarFrom,
      requestUri: 'sip:+15551234567@sip.vspphone.com',
      to: 'sip:+15551234567@sip.vspphone.com',
      callId: 'call-desk-pstn',
      intentHint: 'OUTBOUND',
      cli: '100',
    };

    const plan = await service.resolve(dto, meta);

    expect(plan.callIntent).toBe('OUTBOUND');
    expect(plan.tenantId).toBe(tenantId);
    expect(plan.fromLineId).toBe(lineId);
    expect(plan.actions[0]?.type).toBe('BRIDGE_CARRIER');
    expect(carriers.selectOutboundTrunk).toHaveBeenCalled();
  });
});
