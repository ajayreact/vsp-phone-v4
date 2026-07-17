import { RouteDestinationType } from '@prisma/client';
import { TenantDidsService } from './tenant-dids.service';

describe('TenantDidsService.listDestinations (One DID ↔ One Extension)', () => {
  const tenantId = 'tenant-1';

  function makeService(extensionFindMany: jest.Mock) {
    const prisma = {
      connected: true,
      extension: { findMany: extensionFindMany },
      line: { findMany: jest.fn() },
    };
    return new TenantDidsService(prisma as never, {} as never);
  }

  beforeEach(() => {
    delete process.env.ALLOW_MULTIPLE_DIDS_PER_EXTENSION;
  });

  it('queries only extensions without an active DID', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'ext-100',
        extension: '100',
        line: { name: 'Reception', user: null },
      },
    ]);
    const svc = makeService(findMany);

    const rows = await svc.listDestinations(tenantId, RouteDestinationType.EXTENSION, {
      forPhoneNumberId: 'pn-new',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId,
          deletedAt: null,
          line: {
            deletedAt: null,
            phoneNumbers: {
              none: { deletedAt: null, id: { not: 'pn-new' } },
            },
          },
        },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'ext-100', extension: '100' });
  });

  it('excludes occupied extensions when phoneNumberId omitted', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = makeService(findMany);

    await svc.listDestinations(tenantId, RouteDestinationType.EXTENSION);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId,
          deletedAt: null,
          line: {
            deletedAt: null,
            phoneNumbers: { none: { deletedAt: null } },
          },
        },
      }),
    );
  });

  it('lists all extensions when ALLOW_MULTIPLE_DIDS_PER_EXTENSION=true', async () => {
    process.env.ALLOW_MULTIPLE_DIDS_PER_EXTENSION = 'true';
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = makeService(findMany);

    await svc.listDestinations(tenantId, RouteDestinationType.EXTENSION);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId, deletedAt: null },
      }),
    );
  });
});
