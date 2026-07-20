import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const MAC_ALREADY_EXISTS_CODE = 'MAC_ALREADY_EXISTS';
export const MAC_ALREADY_EXISTS_MESSAGE =
  'This MAC address is already assigned to another device.';
export const MAC_ALREADY_EXISTS_HELP =
  'Either remove the existing device or clear its MAC address before adding it again.';

/** Map Prisma unique violations on devices.mac_address → 409 Conflict. */
export function throwMacConflictIfPrisma(err: unknown): never {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  ) {
    const target = err.meta?.target;
    const fields = Array.isArray(target)
      ? target.map(String)
      : typeof target === 'string'
        ? [target]
        : [];
    const joined = fields.join(',').toLowerCase();
    if (joined.includes('mac_address') || joined.includes('tenant_id')) {
      macAlreadyExistsConflict();
    }
  }
  throw err;
}

export function macAlreadyExistsConflict(): never {
  throw new ConflictException({
    code: MAC_ALREADY_EXISTS_CODE,
    message: MAC_ALREADY_EXISTS_MESSAGE,
    field: 'macAddress',
    details: MAC_ALREADY_EXISTS_HELP,
  });
}
