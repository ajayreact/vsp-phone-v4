import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LineSipEndpointService } from './line-sip-endpoint.service';

describe('LineSipEndpointService', () => {
  const config = {
    get: (key: string, def?: string) => (key === 'SIP_PLATFORM_DOMAIN' ? 'vsp.internal' : def),
  } as unknown as ConfigService;

  function createService(client: Record<string, unknown>) {
    const prisma = client as never;
    return new LineSipEndpointService(prisma, config);
  }

  it('buildAor uses tenant slug + extension + platform domain', () => {
    const svc = createService({});
    expect(svc.buildAor('acme', '101')).toBe('sip:101@acme.sip.vsp.internal');
  });

  it('returns existing line.sipEndpoint without creating another', async () => {
    const existing = { id: 'sip-1', aor: 'sip:101@acme.sip.vsp.internal', deletedAt: null };
    const lineUpdate = jest.fn();
    const create = jest.fn();
    const client = {
      line: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'line-1',
          sipEndpointId: 'sip-1',
          sipEndpoint: existing,
          extension: { extension: '101' },
          tenant: { slug: 'acme' },
        }),
        update: lineUpdate,
      },
      sIPEndpoint: { create, findFirst: jest.fn() },
      device: { findFirst: jest.fn() },
    };

    const svc = createService(client);
    const result = await svc.resolveOrCreateForLine({
      tenantId: 't1',
      lineId: 'line-1',
      actorUserId: 'u1',
    });

    expect(result.id).toBe('sip-1');
    expect(create).not.toHaveBeenCalled();
    expect(lineUpdate).not.toHaveBeenCalled();
  });

  it('attaches existing AOR endpoint to line when sipEndpointId missing', async () => {
    const byAor = { id: 'sip-2', aor: 'sip:101@acme.sip.vsp.internal', deletedAt: null };
    const lineUpdate = jest.fn().mockResolvedValue({});
    const client = {
      line: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'line-1',
          sipEndpointId: null,
          sipEndpoint: null,
          extension: { extension: '101' },
          tenant: { slug: 'acme' },
        }),
        update: lineUpdate,
      },
      sIPEndpoint: {
        findFirst: jest.fn().mockResolvedValue(byAor),
        create: jest.fn(),
      },
      device: { findFirst: jest.fn() },
    };

    const svc = createService(client);
    const result = await svc.resolveOrCreateForLine({
      tenantId: 't1',
      lineId: 'line-1',
    });

    expect(result.id).toBe('sip-2');
    expect(lineUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sipEndpointId: 'sip-2' }),
      }),
    );
    expect(client.sIPEndpoint.create).not.toHaveBeenCalled();
  });

  it('creates exactly one SIP endpoint when none exists and stores on line', async () => {
    const created = {
      id: 'sip-new',
      aor: 'sip:101@acme.sip.vsp.internal',
      authUsername: '101',
    };
    const lineUpdate = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue(created);
    const client = {
      line: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'line-1',
          sipEndpointId: null,
          sipEndpoint: null,
          extension: { extension: '101' },
          tenant: { slug: 'acme' },
        }),
        update: lineUpdate,
      },
      sIPEndpoint: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
      device: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const svc = createService(client);
    const result = await svc.resolveOrCreateForLine({
      tenantId: 't1',
      lineId: 'line-1',
      actorUserId: 'u1',
    });

    expect(result.id).toBe('sip-new');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.aor).toBe('sip:101@acme.sip.vsp.internal');
    expect(lineUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sipEndpointId: 'sip-new' }),
      }),
    );
  });

  it('throws when line has no extension', async () => {
    const client = {
      line: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'line-1',
          extension: null,
          tenant: { slug: 'acme' },
        }),
      },
    };
    const svc = createService(client);
    await expect(
      svc.resolveOrCreateForLine({ tenantId: 't1', lineId: 'line-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
