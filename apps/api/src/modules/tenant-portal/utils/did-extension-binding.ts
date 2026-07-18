import { BadRequestException, ConflictException } from '@nestjs/common';
import { LineStatus, PhoneNumberStatus, type Prisma } from '@prisma/client';

/**
 * Production rule: One DID ↔ One Extension (via Line).
 * - A line may have at most one active phone number.
 * - A phone number may bind to at most one line.
 *
 * Override only via ALLOW_MULTIPLE_DIDS_PER_EXTENSION=true (default false).
 */

export function isMultipleDidsPerExtensionAllowed(
  envValue: string | undefined = process.env.ALLOW_MULTIPLE_DIDS_PER_EXTENSION,
): boolean {
  const raw = (envValue ?? 'false').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/** Prisma where: extensions eligible as DID assign targets. */
export function extensionAssignDestinationWhere(
  tenantId: string,
  opts: { allowMultipleDids?: boolean; forPhoneNumberId?: string } = {},
): Prisma.ExtensionWhereInput {
  const allowMultiple =
    opts.allowMultipleDids ?? isMultipleDidsPerExtensionAllowed();
  const base: Prisma.ExtensionWhereInput = { tenantId, deletedAt: null };
  if (allowMultiple) return base;

  return {
    ...base,
    line: {
      deletedAt: null,
      phoneNumbers: {
        none: {
          deletedAt: null,
          ...(opts.forPhoneNumberId ? { id: { not: opts.forPhoneNumberId } } : {}),
        },
      },
    },
  };
}

/** Prisma where: lines eligible as DID assign targets. */
export function lineAssignDestinationWhere(
  tenantId: string,
  opts: { allowMultipleDids?: boolean; forPhoneNumberId?: string } = {},
): Prisma.LineWhereInput {
  const allowMultiple =
    opts.allowMultipleDids ?? isMultipleDidsPerExtensionAllowed();
  const base: Prisma.LineWhereInput = { tenantId, deletedAt: null };
  if (allowMultiple) return base;

  return {
    ...base,
    phoneNumbers: {
      none: {
        deletedAt: null,
        ...(opts.forPhoneNumberId ? { id: { not: opts.forPhoneNumberId } } : {}),
      },
    },
  };
}

export async function assertCanBindDidToLine(
  db: Prisma.TransactionClient,
  params: {
    tenantId: string;
    phoneNumberId: string;
    lineId: string;
    /** When true, skip "line already has a DID" check. Defaults from env. */
    allowMultipleDidsPerExtension?: boolean;
  },
): Promise<void> {
  const phone = await db.phoneNumber.findFirst({
    where: { id: params.phoneNumberId, deletedAt: null },
    select: { id: true, lineId: true, tenantId: true },
  });
  if (!phone) {
    throw new BadRequestException('Phone number not found');
  }
  if (phone.tenantId !== params.tenantId) {
    throw new BadRequestException('Phone number does not belong to this tenant');
  }
  if (phone.lineId && phone.lineId !== params.lineId) {
    throw new ConflictException(
      'This DID is already assigned to another extension. Unassign it first.',
    );
  }

  const allowMultiple =
    params.allowMultipleDidsPerExtension ?? isMultipleDidsPerExtensionAllowed();
  if (allowMultiple) return;

  const otherOnLine = await db.phoneNumber.count({
    where: {
      lineId: params.lineId,
      deletedAt: null,
      id: { not: params.phoneNumberId },
    },
  });
  if (otherOnLine > 0) {
    throw new ConflictException(
      'This extension already has a primary DID. Unassign it before attaching another number.',
    );
  }
}

/** Detach DID from prior line/tenant and mark that line Inactive (preserve history). */
export async function detachDidFromPriorExtension(
  tx: Prisma.TransactionClient,
  params: {
    phoneNumberId: string;
    actorUserId?: string;
    /** When moving to a new tenant, scrub inbound routes on the old tenant. */
    nextTenantId?: string;
    /** Keep ownership; mark DID UNASSIGNED + available for in-tenant pool. */
    markUnassignedInTenant?: boolean;
  },
): Promise<{ priorTenantId: string | null; priorLineId: string | null }> {
  const phone = await tx.phoneNumber.findFirst({
    where: { id: params.phoneNumberId, deletedAt: null },
    select: { id: true, tenantId: true, lineId: true },
  });
  if (!phone) return { priorTenantId: null, priorLineId: null };

  const priorTenantId = phone.tenantId;
  const priorLineId = phone.lineId;

  await tx.numberAssignment.updateMany({
    where: { phoneNumberId: phone.id, effectiveTo: null, deletedAt: null },
    data: { effectiveTo: new Date(), updatedBy: params.actorUserId },
  });

  // Soft-delete inbound routes for this DID on the prior tenant (prevents stale routing + backfill).
  const routeWhere: Prisma.InboundRouteWhereInput = {
    phoneNumberId: phone.id,
    deletedAt: null,
  };
  if (params.nextTenantId && params.nextTenantId !== priorTenantId) {
    routeWhere.tenantId = priorTenantId;
  }

  await tx.inboundRoute.updateMany({
    where: routeWhere,
    data: {
      enabled: false,
      deletedAt: new Date(),
      updatedBy: params.actorUserId,
    },
  });

  if (priorLineId) {
    await tx.callerID.updateMany({
      where: { lineId: priorLineId, phoneNumberId: phone.id, deletedAt: null },
      data: { phoneNumberId: null, updatedBy: params.actorUserId },
    });

    await tx.line.update({
      where: { id: priorLineId },
      data: {
        status: LineStatus.INACTIVE,
        updatedBy: params.actorUserId,
        version: { increment: 1 },
      },
    });
  }

  await tx.phoneNumber.update({
    where: { id: phone.id },
    data: {
      lineId: null,
      updatedBy: params.actorUserId,
      ...(params.markUnassignedInTenant
        ? { status: PhoneNumberStatus.UNASSIGNED, available: true, siteId: null }
        : {}),
    },
  });

  return { priorTenantId, priorLineId };
}

/**
 * Keep DID ownership on the tenant; clear extension/line binding and mark pool-available.
 * Used by Reset Tenant (never moves ownerTenantId / tenantId — not Global Inventory).
 */
export async function unassignDidInTenant(
  tx: Prisma.TransactionClient,
  params: { tenantId: string; phoneNumberId: string; actorUserId?: string },
): Promise<void> {
  await detachDidFromPriorExtension(tx, {
    phoneNumberId: params.phoneNumberId,
    actorUserId: params.actorUserId,
    markUnassignedInTenant: true,
  });
  await tx.phoneNumber.updateMany({
    where: { id: params.phoneNumberId, tenantId: params.tenantId, deletedAt: null },
    data: {
      status: PhoneNumberStatus.UNASSIGNED,
      available: true,
      siteId: null,
      lineId: null,
      updatedBy: params.actorUserId,
    },
  });
}

/** Unassign every DID owned by the tenant (ownership unchanged). */
export async function unassignAllDidsInTenant(
  tx: Prisma.TransactionClient,
  params: { tenantId: string; actorUserId?: string },
): Promise<number> {
  const phones = await tx.phoneNumber.findMany({
    where: { tenantId: params.tenantId, deletedAt: null },
    select: { id: true },
  });
  for (const phone of phones) {
    await unassignDidInTenant(tx, {
      tenantId: params.tenantId,
      phoneNumberId: phone.id,
      actorUserId: params.actorUserId,
    });
  }
  return phones.length;
}

/** Mark line Inactive after DID removed; keep extension + history. */
export async function markLineInactiveAfterDidRemoval(
  tx: Prisma.TransactionClient,
  lineId: string,
  actorUserId?: string,
): Promise<void> {
  await tx.line.update({
    where: { id: lineId },
    data: {
      status: LineStatus.INACTIVE,
      updatedBy: actorUserId,
      version: { increment: 1 },
    },
  });
}

/** Reactivate line when a DID is (re)attached. */
export async function markLineActiveOnDidAttach(
  tx: Prisma.TransactionClient,
  lineId: string,
  actorUserId?: string,
): Promise<void> {
  await tx.line.update({
    where: { id: lineId },
    data: {
      status: LineStatus.ACTIVE,
      updatedBy: actorUserId,
      version: { increment: 1 },
    },
  });
}
