import { NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { TenantUsersService } from './tenant-users.service';

describe('TenantUsersService.softDelete', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const actorId = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';
  const lineId = '44444444-4444-4444-4444-444444444444';

  function buildService() {
    const lineUpdate = jest.fn().mockResolvedValue(undefined);
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const tx = {
      line: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: lineId,
            name: 'Basha',
            extension: { extension: '102' },
          },
        ]),
        update: lineUpdate,
      },
      user: { update: userUpdate },
    };

    const prisma = {
      connected: true,
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: userId,
          profile: { displayName: 'Basha', firstName: 'Basha', lastName: '' },
        }),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
    };

    const usersAdmin = { list: jest.fn().mockResolvedValue([]) };
    const audit = { append: jest.fn().mockResolvedValue(undefined) };

    const service = new TenantUsersService(prisma as never, usersAdmin as never, audit as never);
    return { service, prisma, tx, lineUpdate, userUpdate, audit };
  }

  it('keeps the extension but resets line.name when it matched the deleted user display name', async () => {
    const { service, lineUpdate, userUpdate } = buildService();

    await service.softDelete(tenantId, actorId, userId);

    expect(lineUpdate).toHaveBeenCalledWith({
      where: { id: lineId },
      data: {
        userId: null,
        updatedBy: actorId,
        name: 'Extension 102',
      },
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: userId },
      data: expect.objectContaining({
        deletedAt: expect.any(Date),
        status: UserStatus.INACTIVE,
      }),
    });
  });

  it('does not rename line.name when it does not exactly match the deleted user display name', async () => {
    const { service, tx, lineUpdate } = buildService();
    tx.line.findMany.mockResolvedValue([
      {
        id: lineId,
        name: 'Reception',
        extension: { extension: '102' },
      },
    ]);

    await service.softDelete(tenantId, actorId, userId);

    expect(lineUpdate).toHaveBeenCalledWith({
      where: { id: lineId },
      data: {
        userId: null,
        updatedBy: actorId,
      },
    });
  });

  it('throws when the user does not exist', async () => {
    const { service, prisma } = buildService();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.softDelete(tenantId, actorId, userId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
