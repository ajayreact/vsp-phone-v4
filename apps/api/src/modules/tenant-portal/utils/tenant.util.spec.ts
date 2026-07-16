import { ForbiddenException } from '@nestjs/common';
import { assertPhoneNumberBelongsToTenant, requireTenantId, tenantScope } from './tenant.util';

describe('tenant.util isolation helpers', () => {
  it('tenantScope always includes tenantId + deletedAt', () => {
    expect(tenantScope('t-1')).toEqual({ tenantId: 't-1', deletedAt: null });
  });

  it('requireTenantId rejects empty context', () => {
    expect(() => requireTenantId(undefined)).toThrow();
    expect(() => requireTenantId('')).toThrow();
    expect(requireTenantId('abc')).toBe('abc');
  });

  it('assertPhoneNumberBelongsToTenant no-ops for empty id', async () => {
    const db = { phoneNumber: { findFirst: jest.fn() } };
    await assertPhoneNumberBelongsToTenant(db, null, 't1');
    await assertPhoneNumberBelongsToTenant(db, undefined, 't1');
    await assertPhoneNumberBelongsToTenant(db, '', 't1');
    expect(db.phoneNumber.findFirst).not.toHaveBeenCalled();
  });

  it('assertPhoneNumberBelongsToTenant rejects foreign DID', async () => {
    const db = {
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    await expect(assertPhoneNumberBelongsToTenant(db, 'pn-other', 't1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.phoneNumber.findFirst).toHaveBeenCalledWith({
      where: { id: 'pn-other', tenantId: 't1', deletedAt: null },
      select: { id: true },
    });
  });

  it('assertPhoneNumberBelongsToTenant allows owned DID', async () => {
    const db = {
      phoneNumber: {
        findFirst: jest.fn().mockResolvedValue({ id: 'pn-1' }),
      },
    };
    await expect(assertPhoneNumberBelongsToTenant(db, 'pn-1', 't1')).resolves.toBeUndefined();
  });
});
