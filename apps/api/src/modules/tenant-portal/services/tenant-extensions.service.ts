import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { tenantScope } from '../utils/tenant.util';

export type CreateExtensionDto = {
  lineId: string;
  extension: string;
};

export type UpdateExtensionDto = {
  extension?: string;
};

@Injectable()
export class TenantExtensionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, search?: string) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.extension = { contains: search.trim(), mode: 'insensitive' };
    }

    return this.prisma.extension.findMany({
      where,
      include: { line: { select: { id: true, name: true, userId: true } } },
      orderBy: { extension: 'asc' },
      take: 500,
    });
  }

  async create(tenantId: string, userId: string, dto: CreateExtensionDto) {
    const line = await this.prisma.line.findFirst({
      where: { id: dto.lineId, tenantId, deletedAt: null },
    });
    if (!line) throw new NotFoundException('Line not found');

    return this.prisma.extension.create({
      data: {
        id: randomUUID(),
        tenantId,
        lineId: dto.lineId,
        extension: dto.extension,
        createdBy: userId,
      },
      include: { line: { select: { id: true, name: true } } },
    });
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateExtensionDto) {
    const existing = await this.require(tenantId, id);
    return this.prisma.extension.update({
      where: { id: existing.id },
      data: {
        ...(dto.extension !== undefined ? { extension: dto.extension } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.require(tenantId, id);
    return this.prisma.extension.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
  }

  private async require(tenantId: string, id: string) {
    const row = await this.prisma.extension.findFirst({
      where: { id, ...tenantScope(tenantId) },
    });
    if (!row) throw new NotFoundException('Extension not found');
    return row;
  }
}
