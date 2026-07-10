import { Injectable, NotFoundException } from '@nestjs/common';
import { NumberRequestStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type CreateNumberRequestDto = {
  phoneNumber: string;
  notes?: string;
};

@Injectable()
export class TenantNumberRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.numberRequest.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async create(tenantId: string, userId: string, dto: CreateNumberRequestDto) {
    return this.prisma.numberRequest.create({
      data: {
        id: randomUUID(),
        tenantId,
        phoneNumber: dto.phoneNumber,
        notes: dto.notes,
        status: NumberRequestStatus.PENDING,
        requestedBy: userId,
      },
    });
  }

  async get(tenantId: string, id: string) {
    const row = await this.prisma.numberRequest.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Number request not found');
    return row;
  }
}
