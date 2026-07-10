import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NumberRequestStatus, NumberReservationStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { TelnyxNumbersService } from '../../carrier-admin/services/telnyx-numbers.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type { BulkNumberRequestDto, CreateNumberRequestDto } from '../dto/tenant-marketplace.dto';
import { NumberNotificationsService } from '../../carrier-admin/services/number-notifications.service';

export type TenantNumberRequestRecord = {
  id: string;
  tenantId: string;
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
  reservationExpiresAt: string | null;
  bulkRequestId: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class TenantNumberRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: TelnyxNumbersService,
    private readonly audit: EnterpriseAuditService,
    private readonly notifications: NumberNotificationsService,
  ) {}

  async list(tenantId: string, status?: string): Promise<TenantNumberRequestRecord[]> {
    if (!this.prisma.connected) return [];

    const rows = await this.prisma.numberRequest.findMany({
      where: {
        tenantId,
        ...(status ? { status: status as NumberRequestStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return Promise.all(rows.map((r) => this.enrich(r)));
  }

  async create(tenantId: string, userId: string, dto: CreateNumberRequestDto) {
    const normalized = dto.phoneNumber.startsWith('+')
      ? dto.phoneNumber
      : `+${dto.phoneNumber.replace(/\D/g, '')}`;

    const inventory = await this.numbers.findInventoryNumberByE164(normalized);
    if (!inventory) throw new BadRequestException('Number is not available in platform inventory');

    let reservationId = dto.reservationId ?? null;
    let reservationExpiresAt: Date | null = null;

    if (reservationId) {
      const reservation = await this.prisma.numberReservation.findFirst({
        where: {
          id: reservationId,
          tenantId,
          phoneNumber: normalized,
          status: NumberReservationStatus.ACTIVE,
          expiresAt: { gt: new Date() },
        },
      });
      if (!reservation) throw new BadRequestException('Active reservation not found for this number');
      reservationExpiresAt = reservation.expiresAt;
    } else {
      const reservation = await this.prisma.numberReservation.findFirst({
        where: {
          tenantId,
          phoneNumber: normalized,
          status: NumberReservationStatus.ACTIVE,
          expiresAt: { gt: new Date() },
        },
      });
      if (reservation) {
        reservationId = reservation.id;
        reservationExpiresAt = reservation.expiresAt;
      }
    }

    const pendingDuplicate = await this.prisma.numberRequest.findFirst({
      where: { tenantId, phoneNumber: normalized, status: NumberRequestStatus.PENDING },
    });
    if (pendingDuplicate) throw new BadRequestException('A pending request already exists for this number');

    const row = await this.prisma.numberRequest.create({
      data: {
        id: randomUUID(),
        tenantId,
        phoneNumber: normalized,
        status: NumberRequestStatus.PENDING,
        requestedBy: userId,
        reservationId,
        reservationExpiresAt,
        notes: dto.notes,
        businessReason: dto.businessReason,
        priority: dto.priority ?? 'normal',
        requestedFeatures: dto.requestedFeatures ?? [],
      },
    });

    if (reservationId) {
      await this.prisma.numberReservation.update({
        where: { id: reservationId },
        data: { numberRequestId: row.id },
      });
    }

    await this.audit.append({
      tenantId,
      actorUserId: userId,
      actorType: 'admin',
      action: 'marketplace.request.submitted',
      resourceType: 'number_request',
      resourceId: row.id,
      detail: { phoneNumber: normalized, reservationId, priority: row.priority },
    });

    await this.notifications.notify(tenantId, {
      userId,
      type: 'request_submitted',
      title: 'Number request submitted',
      body: `Your request for ${normalized} is pending platform approval.`,
      metadata: { requestId: row.id, phoneNumber: normalized },
    });

    return this.enrich(row);
  }

  async bulkCreate(tenantId: string, userId: string, dto: BulkNumberRequestDto) {
    const bulkRequestId = randomUUID();
    const results: TenantNumberRequestRecord[] = [];
    const errors: Array<{ phoneNumber: string; error: string }> = [];

    for (const phone of dto.phoneNumbers) {
      try {
        const created = await this.create(tenantId, userId, {
          phoneNumber: phone,
          notes: dto.notes,
          businessReason: dto.businessReason,
          priority: dto.priority,
        });
        await this.prisma.numberRequest.update({
          where: { id: created.id },
          data: { bulkRequestId },
        });
        results.push({ ...created, bulkRequestId });
      } catch (err) {
        errors.push({ phoneNumber: phone, error: err instanceof Error ? err.message : 'Failed' });
      }
    }

    return { succeeded: results, failed: errors, bulkRequestId };
  }

  async get(tenantId: string, id: string): Promise<TenantNumberRequestRecord> {
    const row = await this.prisma.numberRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Number request not found');
    return this.enrich(row);
  }

  async cancel(tenantId: string, userId: string, id: string) {
    const row = await this.prisma.numberRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Number request not found');
    if (row.status !== NumberRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled');
    }

    await this.prisma.numberRequest.update({
      where: { id },
      data: { status: NumberRequestStatus.CANCELLED },
    });

    if (row.reservationId) {
      await this.prisma.numberReservation.updateMany({
        where: { id: row.reservationId, tenantId },
        data: { status: NumberReservationStatus.RELEASED },
      });
    }

    await this.audit.append({
      tenantId,
      actorUserId: userId,
      actorType: 'admin',
      action: 'marketplace.request.cancelled',
      resourceType: 'number_request',
      resourceId: id,
      detail: { phoneNumber: row.phoneNumber },
    });

    return this.get(tenantId, id);
  }

  async withdraw(tenantId: string, userId: string, id: string) {
    return this.cancel(tenantId, userId, id);
  }

  async duplicate(tenantId: string, userId: string, id: string) {
    const source = await this.get(tenantId, id);
    return this.create(tenantId, userId, {
      phoneNumber: source.phoneNumber,
      notes: source.notes ?? undefined,
      businessReason: source.businessReason ?? undefined,
      priority: source.priority as CreateNumberRequestDto['priority'],
      requestedFeatures: source.requestedFeatures,
    });
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
    reservationExpiresAt: Date | null;
    bulkRequestId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<TenantNumberRequestRecord> {
    let requesterEmail: string | undefined;
    let requesterName: string | undefined;
    if (row.requestedBy) {
      const user = await this.prisma.user.findFirst({
        where: { id: row.requestedBy },
        select: { email: true, profile: { select: { displayName: true } } },
      });
      requesterEmail = user?.email;
      requesterName = user?.profile?.displayName ?? undefined;
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
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
      reservationExpiresAt: row.reservationExpiresAt?.toISOString() ?? null,
      bulkRequestId: row.bulkRequestId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
