import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NumberRequestStatus,
  NumberReservationStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { NumberNotificationsService } from './number-notifications.service';
import type { ReviewNumberRequestDto } from '../dto/telnyx-numbers.dto';
import { TelnyxNumbersService } from './telnyx-numbers.service';

export type NumberRequestRecord = {
  id: string;
  tenantId: string;
  tenantName: string;
  companyName: string;
  phoneNumber: string;
  status: string;
  requestedBy: string;
  requesterEmail?: string;
  requesterName?: string;
  reviewedBy: string | null;
  reservationId: string | null;
  businessReason: string | null;
  priority: string;
  requestedFeatures: string[];
  notes: string | null;
  internalNotes: string | null;
  reservationExpiresAt: string | null;
  bulkRequestId: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class TelnyxNumberRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: TelnyxNumbersService,
    private readonly audit: EnterpriseAuditService,
    private readonly notifications: NumberNotificationsService,
  ) {}

  async listPlatform(status?: string): Promise<NumberRequestRecord[]> {
    if (!this.prisma.connected) return [];

    const rows = await this.prisma.numberRequest.findMany({
      where: status ? { status: status as NumberRequestStatus } : undefined,
      include: {
        tenant: { select: { name: true, displayName: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    return Promise.all(rows.map((row) => this.enrich(row)));
  }

  async getPlatform(id: string): Promise<NumberRequestRecord> {
    const row = await this.prisma.numberRequest.findFirst({
      where: { id },
      include: { tenant: { select: { name: true, displayName: true } } },
    });
    if (!row) throw new NotFoundException('Number request not found');
    return this.enrich(row);
  }

  async getHistory(id: string) {
    const row = await this.getPlatform(id);
    const auditEntries = await this.audit.query({
      tenantId: row.tenantId,
      limit: 100,
      actionPrefix: 'marketplace.',
    });
    const telnyxAudit = await this.audit.query({
      tenantId: row.tenantId,
      limit: 50,
      actionPrefix: 'telnyx.number_request.',
    });
    return {
      request: row,
      audit: [...auditEntries, ...telnyxAudit].filter(
        (e) =>
          e.resourceId === id ||
          (e.detail as Record<string, unknown> | undefined)?.requestId === id ||
          (e.detail as Record<string, unknown> | undefined)?.phoneNumber === row.phoneNumber,
      ),
    };
  }

  async approve(id: string, reviewerId: string, dto?: ReviewNumberRequestDto) {
    const row = await this.prisma.numberRequest.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Number request not found');
    if (row.status !== NumberRequestStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    const action = dto?.action ?? 'assign';
    let inventory = await this.numbers.findInventoryNumberByE164(row.phoneNumber);

    if (!inventory && action === 'purchase_then_assign') {
      const purchased = await this.numbers.purchase(
        { phoneNumber: row.phoneNumber, countryCode: 'US', reservationId: row.reservationId ?? undefined },
        reviewerId,
      );
      inventory = purchased;
      await this.prisma.numberRequest.update({
        where: { id },
        data: { status: NumberRequestStatus.PURCHASED },
      });
    } else if (!inventory) {
      throw new BadRequestException('Requested number is not available in platform inventory');
    }

    if (row.reservationId) {
      await this.prisma.numberReservation.updateMany({
        where: { id: row.reservationId },
        data: { status: NumberReservationStatus.CONVERTED },
      });
    } else {
      await this.numbers.reserve({ phoneNumber: row.phoneNumber, countryCode: 'US' }, reviewerId);
    }

    await this.prisma.numberRequest.update({
      where: { id },
      data: {
        status: NumberRequestStatus.APPROVED,
        reviewedBy: reviewerId,
        notes: dto?.notes ?? row.notes,
        internalNotes: dto?.internalNotes ?? row.internalNotes,
      },
    });

    let assigned;
    try {
      assigned = await this.numbers.assign(
        inventory!.id,
        { tenantId: row.tenantId },
        reviewerId,
      );
    } catch (err) {
      await this.notifications.notify(row.tenantId, {
        type: 'assignment_failed',
        title: 'Number assignment failed',
        body: `Assignment of ${row.phoneNumber} failed. Platform support has been notified.`,
        metadata: { requestId: id, phoneNumber: row.phoneNumber, error: err instanceof Error ? err.message : 'Unknown' },
      });
      throw err;
    }

    await this.prisma.numberRequest.update({
      where: { id },
      data: { status: NumberRequestStatus.ASSIGNED },
    });

    await this.audit.append({
      tenantId: row.tenantId,
      actorUserId: reviewerId,
      actorType: 'admin',
      action: 'telnyx.number_request.approved',
      resourceType: 'number_request',
      resourceId: id,
      detail: { phoneNumber: row.phoneNumber, action, numberId: assigned.id },
    });

    await this.audit.append({
      tenantId: row.tenantId,
      actorUserId: reviewerId,
      actorType: 'admin',
      action: 'marketplace.billing.updated',
      resourceType: 'number_request',
      resourceId: id,
      detail: { phoneNumber: row.phoneNumber, monthlyCost: assigned.monthlyCost, note: 'Billing record queued' },
    });

    await this.notifications.notify(row.tenantId, {
      type: 'request_approved',
      title: 'Number request approved',
      body: `${row.phoneNumber} has been approved and assigned to your tenant.`,
      metadata: { requestId: id, phoneNumber: row.phoneNumber, numberId: assigned.id },
    });

    await this.notifications.notify(row.tenantId, {
      type: 'number_assigned',
      title: 'Number assigned',
      body: `${row.phoneNumber} is now active on your account.`,
      metadata: { requestId: id, phoneNumber: row.phoneNumber },
    });

    return { request: await this.getPlatform(id), number: assigned };
  }

  async reject(id: string, reviewerId: string, notes?: string, internalNotes?: string) {
    const row = await this.prisma.numberRequest.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Number request not found');
    if (row.status !== NumberRequestStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    await this.prisma.numberRequest.update({
      where: { id },
      data: {
        status: NumberRequestStatus.REJECTED,
        reviewedBy: reviewerId,
        notes: notes ?? row.notes,
        internalNotes: internalNotes ?? row.internalNotes,
      },
    });

    if (row.reservationId) {
      await this.prisma.numberReservation.updateMany({
        where: { id: row.reservationId },
        data: { status: NumberReservationStatus.RELEASED },
      });
    }

    await this.audit.append({
      tenantId: row.tenantId,
      actorUserId: reviewerId,
      actorType: 'admin',
      action: 'telnyx.number_request.rejected',
      resourceType: 'number_request',
      resourceId: id,
      detail: { phoneNumber: row.phoneNumber },
    });

    await this.notifications.notify(row.tenantId, {
      type: 'request_rejected',
      title: 'Number request rejected',
      body: `Your request for ${row.phoneNumber} was not approved.${notes ? ` Reason: ${notes}` : ''}`,
      metadata: { requestId: id, phoneNumber: row.phoneNumber },
    });

    return this.getPlatform(id);
  }

  async bulkApprove(ids: string[], reviewerId: string, dto?: ReviewNumberRequestDto) {
    const succeeded: NumberRequestRecord[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of ids) {
      try {
        const result = await this.approve(id, reviewerId, dto);
        succeeded.push(result.request);
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : 'Failed' });
      }
    }
    return { succeeded, failed };
  }

  async bulkReject(ids: string[], reviewerId: string, notes?: string) {
    const succeeded: NumberRequestRecord[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    for (const id of ids) {
      try {
        succeeded.push(await this.reject(id, reviewerId, notes));
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : 'Failed' });
      }
    }
    return { succeeded, failed };
  }

  async expireStaleReservations(): Promise<number> {
    if (!this.prisma.connected) return 0;
    const now = new Date();

    const stale = await this.prisma.numberReservation.findMany({
      where: { status: NumberReservationStatus.ACTIVE, expiresAt: { lt: now } },
      take: 500,
    });

    if (!stale.length) return 0;

    await this.prisma.numberReservation.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { status: NumberReservationStatus.EXPIRED },
    });

    for (const reservation of stale) {
      await this.prisma.numberRequest.updateMany({
        where: {
          reservationId: reservation.id,
          status: NumberRequestStatus.PENDING,
        },
        data: { status: NumberRequestStatus.EXPIRED },
      });

      if (reservation.tenantId) {
        await this.audit.append({
          tenantId: reservation.tenantId,
          actorUserId: undefined,
          actorType: 'system',
          action: 'marketplace.reservation.expired',
          resourceType: 'number_reservation',
          resourceId: reservation.id,
          detail: { phoneNumber: reservation.phoneNumber },
        });

        await this.notifications.notify(reservation.tenantId, {
          userId: reservation.reservedBy ?? undefined,
          type: 'reservation_expired',
          title: 'Number reservation expired',
          body: `Your reservation for ${reservation.phoneNumber} has expired.`,
          metadata: { phoneNumber: reservation.phoneNumber, reservationId: reservation.id },
        });
      }
    }

    return stale.length;
  }

  private async enrich(row: {
    id: string;
    tenantId: string;
    phoneNumber: string;
    status: NumberRequestStatus;
    requestedBy: string;
    reviewedBy: string | null;
    reservationId: string | null;
    businessReason: string | null;
    priority: string;
    requestedFeatures: string[];
    notes: string | null;
    internalNotes: string | null;
    reservationExpiresAt: Date | null;
    bulkRequestId: string | null;
    createdAt: Date;
    updatedAt: Date;
    tenant: { name: string; displayName: string };
  }): Promise<NumberRequestRecord> {
    let requesterEmail: string | undefined;
    let requesterName: string | undefined;
    if (row.requestedBy) {
      const user = await this.prisma.user.findFirst({
        where: { id: row.requestedBy },
        select: { email: true, profile: { select: { displayName: true } } },
      });
      requesterEmail = user?.email;
      requesterName = user?.profile?.displayName;
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenant.displayName || row.tenant.name,
      companyName: row.tenant.displayName || row.tenant.name,
      phoneNumber: row.phoneNumber,
      status: row.status,
      requestedBy: row.requestedBy,
      requesterEmail,
      requesterName,
      reviewedBy: row.reviewedBy,
      reservationId: row.reservationId,
      businessReason: row.businessReason,
      priority: row.priority,
      requestedFeatures: row.requestedFeatures,
      notes: row.notes,
      internalNotes: row.internalNotes,
      reservationExpiresAt: row.reservationExpiresAt?.toISOString() ?? null,
      bulkRequestId: row.bulkRequestId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
