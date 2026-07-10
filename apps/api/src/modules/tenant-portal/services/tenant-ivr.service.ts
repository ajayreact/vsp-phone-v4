import { Injectable, NotFoundException } from '@nestjs/common';
import { IvrStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { newPublicId, tenantScope } from '../utils/tenant.util';

export type CreateIvrDto = {
  name: string;
  code: string;
  status?: IvrStatus;
};

export type UpdateIvrDto = Partial<CreateIvrDto>;

@Injectable()
export class TenantIvrService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.iVR.findMany({
      where: tenantScope(tenantId),
      orderBy: { name: 'asc' },
    });
  }

  async create(tenantId: string, userId: string, dto: CreateIvrDto) {
    return this.prisma.iVR.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('ivr'),
        tenantId,
        name: dto.name,
        code: dto.code,
        status: dto.status ?? IvrStatus.ACTIVE,
        createdBy: userId,
      },
    });
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateIvrDto) {
    const existing = await this.require(tenantId, id);
    return this.prisma.iVR.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.require(tenantId, id);
    return this.prisma.iVR.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
  }

  private async require(tenantId: string, id: string) {
    const row = await this.prisma.iVR.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('IVR not found');
    return row;
  }
}
