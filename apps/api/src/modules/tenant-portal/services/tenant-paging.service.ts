import { Injectable, NotFoundException } from '@nestjs/common';
import { IntercomMode, PagingGroupKind, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import type {
  BulkPagingMembersDto,
  CreatePagingGroupDto,
  PagingMemberDto,
  UpdatePagingGroupDto,
} from '../dto/tenant-paging.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { tenantScope } from '../utils/tenant.util';

const pagingInclude = {
  members: {
    where: { deletedAt: null },
    orderBy: [{ priority: 'desc' }],
    include: {
      line: {
        select: {
          id: true,
          name: true,
          extension: { select: { extension: true } },
        },
      },
    },
  },
  targetLine: {
    select: {
      id: true,
      name: true,
      extension: { select: { extension: true } },
    },
  },
} satisfies Prisma.PagingGroupInclude;

@Injectable()
export class TenantPagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string, kind?: PagingGroupKind) {
    if (!this.prisma.connected) return [];
    return this.prisma.pagingGroup.findMany({
      where: {
        ...tenantScope(tenantId),
        ...(kind ? { kind } : {}),
      },
      include: pagingInclude,
      orderBy: [{ priorityLevel: 'desc' }, { name: 'asc' }],
      take: 500,
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.pagingGroup.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: pagingInclude,
    });
    if (!row) throw new NotFoundException('Paging group not found');
    return row;
  }

  async create(tenantId: string, userId: string, dto: CreatePagingGroupDto) {
    const kind = dto.kind ?? PagingGroupKind.PAGING;
    const group = await this.prisma.pagingGroup.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: dto.name,
        code: dto.code,
        kind,
        pagingType: dto.pagingType,
        zone: dto.zone,
        department: dto.department,
        priorityLevel: dto.priorityLevel ?? 100,
        multicastAddress: dto.multicastAddress,
        intercomMode: dto.intercomMode ?? (kind === PagingGroupKind.INTERCOM ? IntercomMode.ONE_WAY : undefined),
        autoAnswer: dto.autoAnswer ?? true,
        whisperEnabled: dto.whisperEnabled ?? false,
        pushToTalk: dto.pushToTalk ?? false,
        targetLineId: dto.targetLineId,
        members: dto.members?.length
          ? {
              create: dto.members.map((m) => ({
                id: randomUUID(),
                tenantId,
                lineId: m.lineId,
                priority: m.priority ?? 0,
              })),
            }
          : undefined,
      },
      include: pagingInclude,
    });

    await this.syncFeatureCode(tenantId, group);
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.paging.create',
      entityType: 'PagingGroup',
      entityId: group.id,
      metadata: { code: dto.code, kind },
    });

    return group;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdatePagingGroupDto) {
    const existing = await this.getById(tenantId, id);

    if (dto.members) {
      await this.prisma.pagingGroupMember.updateMany({
        where: { pagingGroupId: id, tenantId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (dto.members.length) {
        await this.prisma.pagingGroupMember.createMany({
          data: dto.members.map((m) => ({
            id: randomUUID(),
            tenantId,
            pagingGroupId: id,
            lineId: m.lineId,
            priority: m.priority ?? 0,
          })),
        });
      }
    }

    const group = await this.prisma.pagingGroup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.pagingType !== undefined ? { pagingType: dto.pagingType } : {}),
        ...(dto.zone !== undefined ? { zone: dto.zone } : {}),
        ...(dto.department !== undefined ? { department: dto.department } : {}),
        ...(dto.priorityLevel !== undefined ? { priorityLevel: dto.priorityLevel } : {}),
        ...(dto.multicastAddress !== undefined ? { multicastAddress: dto.multicastAddress } : {}),
        ...(dto.intercomMode !== undefined ? { intercomMode: dto.intercomMode } : {}),
        ...(dto.autoAnswer !== undefined ? { autoAnswer: dto.autoAnswer } : {}),
        ...(dto.whisperEnabled !== undefined ? { whisperEnabled: dto.whisperEnabled } : {}),
        ...(dto.pushToTalk !== undefined ? { pushToTalk: dto.pushToTalk } : {}),
        ...(dto.targetLineId !== undefined ? { targetLineId: dto.targetLineId } : {}),
        version: { increment: 1 },
      },
      include: pagingInclude,
    });

    if (dto.code && dto.code !== existing.code) {
      await this.redis.del(this.redis.opsFeatureKey(tenantId, existing.code));
    }
    await this.syncFeatureCode(tenantId, group);

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.paging.update',
      entityType: 'PagingGroup',
      entityId: group.id,
    });

    return group;
  }

  async remove(tenantId: string, userId: string, id: string) {
    const group = await this.getById(tenantId, id);
    await this.prisma.pagingGroup.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.redis.del(this.redis.opsFeatureKey(tenantId, group.code));

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.paging.delete',
      entityType: 'PagingGroup',
      entityId: id,
    });

    return { ok: true };
  }

  async setMembers(tenantId: string, userId: string, id: string, dto: BulkPagingMembersDto) {
    return this.update(tenantId, userId, id, { members: dto.members });
  }

  async getReports(tenantId: string) {
    const [pagingCount, intercomCount, emergencyCount, zoneCount] = await Promise.all([
      this.prisma.pagingGroup.count({ where: { tenantId, deletedAt: null, kind: PagingGroupKind.PAGING } }),
      this.prisma.pagingGroup.count({ where: { tenantId, deletedAt: null, kind: PagingGroupKind.INTERCOM } }),
      this.prisma.pagingGroup.count({
        where: { tenantId, deletedAt: null, pagingType: 'EMERGENCY' },
      }),
      this.prisma.pagingGroup.count({
        where: { tenantId, deletedAt: null, NOT: { zone: null } },
      }),
    ]);
    return { pagingCount, intercomCount, emergencyCount, zoneCount };
  }

  private async syncFeatureCode(tenantId: string, group: Prisma.PagingGroupGetPayload<{ include: typeof pagingInclude }>) {
    const lineIds = group.members.map((m) => m.lineId);

    if (group.kind === PagingGroupKind.INTERCOM && group.targetLineId) {
      const payload = {
        kind: 'INTERCOM' as const,
        tenantId,
        code: group.code,
        targetLineId: group.targetLineId,
        mode: group.intercomMode === IntercomMode.TWO_WAY ? 'two-way' : 'one-way',
        autoAnswer: group.autoAnswer,
        whisperEnabled: group.whisperEnabled,
        pushToTalk: group.pushToTalk,
      };
      await this.redis.setex(this.redis.opsFeatureKey(tenantId, group.code), 86400 * 30, JSON.stringify(payload));
      return;
    }

    const payload = {
      kind: 'PAGING' as const,
      tenantId,
      code: group.code,
      lineIds,
      pagingType: group.pagingType,
      zone: group.zone,
      department: group.department,
      priorityLevel: group.priorityLevel,
      multicastAddress: group.multicastAddress,
    };
    await this.redis.setex(this.redis.opsFeatureKey(tenantId, group.code), 86400 * 30, JSON.stringify(payload));
  }
}
