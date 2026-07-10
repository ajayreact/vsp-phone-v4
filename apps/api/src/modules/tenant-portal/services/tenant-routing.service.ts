import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { tenantScope } from '../utils/tenant.util';

export type CreateCallPolicyDto = {
  lineId: string;
  inboundEnabled?: boolean;
  outboundEnabled?: boolean;
};

export type UpdateCallPolicyDto = {
  inboundEnabled?: boolean;
  outboundEnabled?: boolean;
};

@Injectable()
export class TenantRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async listPolicies(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.callPolicy.findMany({
      where: tenantScope(tenantId),
      include: { line: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPolicy(tenantId: string, userId: string, dto: CreateCallPolicyDto) {
    const line = await this.prisma.line.findFirst({
      where: { id: dto.lineId, tenantId, deletedAt: null },
    });
    if (!line) throw new NotFoundException('Line not found');

    return this.prisma.callPolicy.create({
      data: {
        id: randomUUID(),
        tenantId,
        lineId: dto.lineId,
        inboundEnabled: dto.inboundEnabled ?? true,
        outboundEnabled: dto.outboundEnabled ?? true,
        createdBy: userId,
      },
    });
  }

  async updatePolicy(tenantId: string, userId: string, id: string, dto: UpdateCallPolicyDto) {
    const existing = await this.requirePolicy(tenantId, id);
    return this.prisma.callPolicy.update({
      where: { id: existing.id },
      data: {
        ...(dto.inboundEnabled !== undefined ? { inboundEnabled: dto.inboundEnabled } : {}),
        ...(dto.outboundEnabled !== undefined ? { outboundEnabled: dto.outboundEnabled } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async removePolicy(tenantId: string, userId: string, id: string) {
    const existing = await this.requirePolicy(tenantId, id);
    return this.prisma.callPolicy.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
  }

  private async requirePolicy(tenantId: string, id: string) {
    const row = await this.prisma.callPolicy.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Call policy not found');
    return row;
  }
}
