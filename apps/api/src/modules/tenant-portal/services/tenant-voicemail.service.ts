import { Injectable, NotFoundException } from '@nestjs/common';
import { VoicemailStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { newPublicId, tenantScope } from '../utils/tenant.util';

export type CreateVoicemailDto = {
  lineId: string;
  pin?: string;
  status?: VoicemailStatus;
};

export type UpdateVoicemailDto = {
  pin?: string;
  status?: VoicemailStatus;
};

@Injectable()
export class TenantVoicemailService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.voicemail.findMany({
      where: tenantScope(tenantId),
      include: { line: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, userId: string, dto: CreateVoicemailDto) {
    const line = await this.prisma.line.findFirst({
      where: { id: dto.lineId, tenantId, deletedAt: null },
    });
    if (!line) throw new NotFoundException('Line not found');

    return this.prisma.voicemail.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('vm'),
        tenantId,
        lineId: dto.lineId,
        pin: dto.pin,
        status: dto.status ?? VoicemailStatus.ACTIVE,
        createdBy: userId,
      },
    });
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateVoicemailDto) {
    const existing = await this.require(tenantId, id);
    return this.prisma.voicemail.update({
      where: { id: existing.id },
      data: {
        ...(dto.pin !== undefined ? { pin: dto.pin } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.require(tenantId, id);
    return this.prisma.voicemail.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
  }

  private async require(tenantId: string, id: string) {
    const row = await this.prisma.voicemail.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Voicemail not found');
    return row;
  }
}
