import { BadRequestException, ConflictException } from '@nestjs/common';
import { LineStatus } from '@prisma/client';
import {
  assertCanBindDidToLine,
  detachDidFromPriorExtension,
  markLineInactiveAfterDidRemoval,
} from './did-extension-binding';

describe('did-extension-binding (One DID ↔ One Extension)', () => {
  it('rejects bind when DID already on another line', async () => {
    const db = {
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pn1',
          lineId: 'line-other',
          tenantId: 't1',
        }),
        count: jest.fn(),
      },
    };
    await expect(
      assertCanBindDidToLine(db as never, {
        tenantId: 't1',
        phoneNumberId: 'pn1',
        lineId: 'line-target',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects bind when line already has another DID', async () => {
    const db = {
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pn1',
          lineId: null,
          tenantId: 't1',
        }),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    await expect(
      assertCanBindDidToLine(db as never, {
        tenantId: 't1',
        phoneNumberId: 'pn1',
        lineId: 'line-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects bind when DID belongs to another tenant', async () => {
    const db = {
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pn1',
          lineId: null,
          tenantId: 't-other',
        }),
        count: jest.fn(),
      },
    };
    await expect(
      assertCanBindDidToLine(db as never, {
        tenantId: 't1',
        phoneNumberId: 'pn1',
        lineId: 'line-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows bind when DID free and line empty', async () => {
    const db = {
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pn1',
          lineId: null,
          tenantId: 't1',
        }),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    await expect(
      assertCanBindDidToLine(db as never, {
        tenantId: 't1',
        phoneNumberId: 'pn1',
        lineId: 'line-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('detach marks prior line Inactive and clears phone lineId', async () => {
    const updates: string[] = [];
    const tx = {
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pn1',
          tenantId: 'tenant-a',
          lineId: 'line-a',
        }),
        update: jest.fn().mockImplementation(async () => {
          updates.push('phone');
        }),
      },
      numberAssignment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inboundRoute: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      callerID: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      line: {
        update: jest.fn().mockImplementation(async ({ data }: { data: { status: string } }) => {
          updates.push(`line:${data.status}`);
        }),
      },
    };

    const result = await detachDidFromPriorExtension(tx as never, {
      phoneNumberId: 'pn1',
      actorUserId: 'admin',
      nextTenantId: 'tenant-b',
    });

    expect(result).toEqual({ priorTenantId: 'tenant-a', priorLineId: 'line-a' });
    expect(updates).toContain('line:INACTIVE');
    expect(updates).toContain('phone');
    expect(tx.inboundRoute.updateMany).toHaveBeenCalled();
  });

  it('markLineInactiveAfterDidRemoval sets LineStatus.INACTIVE', async () => {
    const tx = {
      line: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    await markLineInactiveAfterDidRemoval(tx as never, 'line-1', 'user-1');
    expect(tx.line.update).toHaveBeenCalledWith({
      where: { id: 'line-1' },
      data: {
        status: LineStatus.INACTIVE,
        updatedBy: 'user-1',
        version: { increment: 1 },
      },
    });
  });
});
