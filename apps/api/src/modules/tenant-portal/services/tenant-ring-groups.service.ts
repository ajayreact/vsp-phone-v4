import { Injectable, NotFoundException } from '@nestjs/common';
import { RingGroupStrategy } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { newPublicId, tenantScope } from '../utils/tenant.util';

export type CreateRingGroupDto = {
  name: string;
  strategy?: RingGroupStrategy;
  timeoutSec?: number;
};

export type UpdateRingGroupDto = Partial<CreateRingGroupDto>;

export type CreateRingGroupMemberDto = {
  extensionId: string;
  priority?: number;
};

@Injectable()
export class TenantRingGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.ringGroup.findMany({
      where: tenantScope(tenantId),
      include: {
        members: {
          where: { deletedAt: null },
          include: { extension: { select: { id: true, extension: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateRingGroupDto) {
    return this.prisma.ringGroup.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('rg'),
        tenantId,
        name: dto.name,
        strategy: dto.strategy ?? RingGroupStrategy.SIMULTANEOUS,
        timeoutSec: dto.timeoutSec ?? 30,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateRingGroupDto) {
    const existing = await this.requireGroup(tenantId, id);
    return this.prisma.ringGroup.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.strategy !== undefined ? { strategy: dto.strategy } : {}),
        ...(dto.timeoutSec !== undefined ? { timeoutSec: dto.timeoutSec } : {}),
        version: { increment: 1 },
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.requireGroup(tenantId, id);
    return this.prisma.ringGroup.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
  }

  async addMember(tenantId: string, ringGroupId: string, dto: CreateRingGroupMemberDto) {
    await this.requireGroup(tenantId, ringGroupId);
    const ext = await this.prisma.extension.findFirst({
      where: { id: dto.extensionId, ...tenantScope(tenantId) },
    });
    if (!ext) throw new NotFoundException('Extension not found');

    return this.prisma.ringGroupMember.create({
      data: {
        id: randomUUID(),
        tenantId,
        ringGroupId,
        extensionId: dto.extensionId,
        priority: dto.priority ?? 0,
      },
    });
  }

  async removeMember(tenantId: string, ringGroupId: string, memberId: string) {
    await this.requireGroup(tenantId, ringGroupId);
    const member = await this.prisma.ringGroupMember.findFirst({
      where: { id: memberId, ringGroupId, tenantId, deletedAt: null },
    });
    if (!member) throw new NotFoundException('Ring group member not found');
    return this.prisma.ringGroupMember.update({
      where: { id: member.id },
      data: { deletedAt: new Date() },
    });
  }

  private async requireGroup(tenantId: string, id: string) {
    const row = await this.prisma.ringGroup.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Ring group not found');
    return row;
  }
}
