import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

export function newPublicId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function tenantScope(tenantId: string) {
  return { tenantId, deletedAt: null };
}

type PhoneNumberLookup = {
  phoneNumber: {
    findFirst: (args: {
      where: { id: string; tenantId: string; deletedAt: null };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
};

/** Refuse attaching another tenant's DID (IDOR guard). */
export async function assertPhoneNumberBelongsToTenant(
  db: PhoneNumberLookup | Prisma.TransactionClient,
  phoneNumberId: string | null | undefined,
  tenantId: string,
): Promise<void> {
  if (phoneNumberId == null || phoneNumberId === '') return;
  const row = await db.phoneNumber.findFirst({
    where: { id: phoneNumberId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!row) {
    throw new ForbiddenException('Phone number does not belong to this tenant');
  }
}

/** Models that must never be queried without a tenantId filter in tenant services. */
export const TENANT_SCOPED_MODELS = [
  'extension',
  'line',
  'device',
  'phoneNumber',
  'inboundRoute',
  'iVR',
  'ringGroup',
  'user',
] as const;

export function requireTenantId(tenantId: string | null | undefined): string {
  if (!tenantId?.trim()) {
    throw new NotFoundException('Tenant context required');
  }
  return tenantId;
}
