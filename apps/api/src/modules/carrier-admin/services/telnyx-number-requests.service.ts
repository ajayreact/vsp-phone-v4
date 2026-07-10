import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NumberRequestStatus,
  NumberReservationStatus,
  PhoneNumberStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelnyxNumbersService } from './telnyx-numbers.service';

export type NumberRequestRecord = {
  id: string;
  tenantId: string;
  tenantName: string;
  phoneNumber: string;
  status: string;
  requestedBy: string;
  requesterEmail?: string;
  reviewedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class TelnyxNumberRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: TelnyxNumbersService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async listPlatform(status?: string): Promise<NumberRequestRecord[]> {
    if (!this.prisma.connected) return [];

    const rows = await this.prisma.numberRequest.findMany({
      where: status ? { status: status as NumberRequestStatus } : undefined,
      include: {
        tenant: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const enriched: NumberRequestRecord[] = [];
    for (const row of rows) {
      let requesterEmail: string | undefined;
      if (row.requestedBy) {
        const user = await this.prisma.user.findFirst({
          where: { id: row.requestedBy },
          select: { email: true },
        });
        requesterEmail = user?.email;
      }
      enriched.push({
        id: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenant.name,
        phoneNumber: row.phoneNumber,
        status: row.status,
        requestedBy: row.requestedBy,
        requesterEmail,
        reviewedBy: row.reviewedBy,
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    return enriched;
  }

  async approve(id: string, reviewerId: string, notes?: string) {
    const row = await this.prisma.numberRequest.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Number request not found');
    if (row.status !== NumberRequestStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    const inventory = await this.numbers.findInventoryNumberByE164(row.phoneNumber);
    if (!inventory) {
      throw new BadRequestException('Requested number is not available in platform inventory');
    }

    const reservation = await this.numbers.reserve(
      { phoneNumber: row.phoneNumber, countryCode: 'US' },
      reviewerId,
    );

    await this.prisma.numberRequest.update({
      where: { id },
      data: {
        status: NumberRequestStatus.APPROVED,
        reviewedBy: reviewerId,
        notes: notes ?? row.notes,
      },
    });

    const assigned = await this.numbers.assign(
      inventory.id,
      { tenantId: row.tenantId },
      reviewerId,
    );

    await this.audit.append({
      tenantId: row.tenantId,
      actorUserId: reviewerId,
      actorType: 'admin',
      action: 'telnyx.number_request.approved',
      resourceType: 'number_request',
      resourceId: id,
      detail: { phoneNumber: row.phoneNumber, reservationId: reservation.id },
    });

    return { request: await this.getRecord(id), number: assigned, reservation };
  }

  async reject(id: string, reviewerId: string, notes?: string) {
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
      },
    });

    await this.audit.append({
      tenantId: row.tenantId,
      actorUserId: reviewerId,
      actorType: 'admin',
      action: 'telnyx.number_request.rejected',
      resourceType: 'number_request',
      resourceId: id,
      detail: { phoneNumber: row.phoneNumber },
    });

    return this.getRecord(id);
  }

  async expireStaleReservations(): Promise<number> {
    if (!this.prisma.connected) return 0;
    const now = new Date();
    const result = await this.prisma.numberReservation.updateMany({
      where: { status: NumberReservationStatus.ACTIVE, expiresAt: { lt: now } },
      data: { status: NumberReservationStatus.EXPIRED },
    });
    return result.count;
  }

  private async getRecord(id: string): Promise<NumberRequestRecord> {
    const rows = await this.listPlatform();
    const found = rows.find((r) => r.id === id);
    if (!found) throw new NotFoundException('Number request not found');
    return found;
  }
}
