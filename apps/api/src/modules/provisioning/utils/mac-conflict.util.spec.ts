import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MAC_ALREADY_EXISTS_CODE,
  MAC_ALREADY_EXISTS_MESSAGE,
  macAlreadyExistsConflict,
  throwMacConflictIfPrisma,
} from './mac-conflict.util';

describe('mac-conflict.util', () => {
  it('macAlreadyExistsConflict throws 409 with product code', () => {
    expect(() => macAlreadyExistsConflict()).toThrow(ConflictException);
    try {
      macAlreadyExistsConflict();
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      const body = (err as ConflictException).getResponse() as Record<string, unknown>;
      expect(body.code).toBe(MAC_ALREADY_EXISTS_CODE);
      expect(body.message).toBe(MAC_ALREADY_EXISTS_MESSAGE);
      expect(body.field).toBe('macAddress');
    }
  });

  it('throwMacConflictIfPrisma maps tenant_id+mac_address P2002', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['tenant_id', 'mac_address'] },
    });
    expect(() => throwMacConflictIfPrisma(err)).toThrow(ConflictException);
  });

  it('throwMacConflictIfPrisma rethrows unrelated errors', () => {
    expect(() => throwMacConflictIfPrisma(new Error('other'))).toThrow('other');
  });
});
