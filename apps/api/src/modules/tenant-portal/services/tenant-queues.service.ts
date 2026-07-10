import { Injectable, NotFoundException } from '@nestjs/common';
import { QueueMemberStatus, QueueStatus, QueueStrategy } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { newPublicId, tenantScope } from '../utils/tenant.util';

export type CreateQueueDto = {
  name: string;
  code: string;
  strategy?: QueueStrategy;
  status?: QueueStatus;
};

export type UpdateQueueDto = Partial<CreateQueueDto>;

export type CreateQueueMemberDto = {
  lineId: string;
  priority?: number;
  status?: QueueMemberStatus;
};

@Injectable()
export class TenantQueuesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.queue.findMany({
      where: tenantScope(tenantId),
      include: {
        members: { where: { deletedAt: null }, include: { line: { select: { id: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(tenantId: string, userId: string, dto: CreateQueueDto) {
    return this.prisma.queue.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('q'),
        tenantId,
        name: dto.name,
        code: dto.code,
        strategy: dto.strategy ?? QueueStrategy.ROUND_ROBIN,
        status: dto.status ?? QueueStatus.ACTIVE,
        createdBy: userId,
      },
    });
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateQueueDto) {
    const existing = await this.requireQueue(tenantId, id);
    return this.prisma.queue.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.strategy !== undefined ? { strategy: dto.strategy } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.requireQueue(tenantId, id);
    return this.prisma.queue.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
  }

  async listMembers(tenantId: string, queueId: string) {
    await this.requireQueue(tenantId, queueId);
    return this.prisma.queueMember.findMany({
      where: { queueId, ...tenantScope(tenantId) },
      include: { line: { select: { id: true, name: true } } },
      orderBy: { priority: 'asc' },
    });
  }

  async addMember(tenantId: string, userId: string, queueId: string, dto: CreateQueueMemberDto) {
    await this.requireQueue(tenantId, queueId);
    const line = await this.prisma.line.findFirst({
      where: { id: dto.lineId, tenantId, deletedAt: null },
    });
    if (!line) throw new NotFoundException('Line not found');

    return this.prisma.queueMember.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('qm'),
        tenantId,
        queueId,
        lineId: dto.lineId,
        priority: dto.priority ?? 0,
        status: dto.status ?? QueueMemberStatus.ACTIVE,
        createdBy: userId,
      },
    });
  }

  async removeMember(tenantId: string, userId: string, queueId: string, memberId: string) {
    await this.requireQueue(tenantId, queueId);
    const member = await this.prisma.queueMember.findFirst({
      where: { id: memberId, queueId, ...tenantScope(tenantId) },
    });
    if (!member) throw new NotFoundException('Queue member not found');
    return this.prisma.queueMember.update({
      where: { id: member.id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
  }

  private async requireQueue(tenantId: string, id: string) {
    const row = await this.prisma.queue.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Queue not found');
    return row;
  }
}
