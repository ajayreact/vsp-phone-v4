import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QueueStatus, RingGroupStrategy } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  BulkImportRingGroupsDto,
  BulkRingGroupMembersDto,
  CloneRingGroupDto,
  CreateRingGroupDto,
  RingGroupMemberDto,
  UpdateRingGroupDto,
} from '../dto/tenant-ring-groups.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { newPublicId, tenantScope } from '../utils/tenant.util';

const ringGroupInclude = {
  members: {
    where: { deletedAt: null },
    orderBy: [{ memberOrder: 'asc' }, { priority: 'asc' }],
    include: {
      extension: {
        select: {
          id: true,
          extension: true,
          line: {
            select: {
              id: true,
              name: true,
              user: { select: { email: true, profile: { select: { displayName: true } } } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.RingGroupInclude;

@Injectable()
export class TenantRingGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string, search?: string) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { extension: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.ringGroup.findMany({
      where,
      include: ringGroupInclude,
      orderBy: { name: 'asc' },
      take: 500,
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.ringGroup.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: ringGroupInclude,
    });
    if (!row) throw new NotFoundException('Ring group not found');
    return row;
  }

  async create(tenantId: string, userId: string, dto: CreateRingGroupDto) {
    const group = await this.prisma.ringGroup.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('rg'),
        tenantId,
        name: dto.name,
        description: dto.description,
        extension: dto.extension,
        phoneNumberId: dto.phoneNumberId,
        strategy: dto.strategy ?? RingGroupStrategy.SIMULTANEOUS,
        timeoutSec: dto.timeoutSec ?? 30,
        retryCount: dto.retryCount ?? 0,
        maxCycles: dto.maxCycles ?? 1,
        callerIdName: dto.callerIdName,
        recordingPolicyId: dto.recordingPolicyId,
        voicemailLineId: dto.voicemailLineId,
        timeConditionId: dto.timeConditionId,
        holidayCalendarId: dto.holidayCalendarId,
        mohPlaylistId: dto.mohPlaylistId,
        announcementId: dto.announcementId,
        overflowDestinationType: dto.overflowDestinationType,
        overflowDestinationId: dto.overflowDestinationId,
        status: dto.status ?? QueueStatus.ACTIVE,
        createdBy: userId,
      },
      include: ringGroupInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ring_group.create',
      entityType: 'RingGroup',
      entityId: group.id,
      metadata: { name: dto.name, strategy: group.strategy },
    });

    return group;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateRingGroupDto) {
    await this.requireGroup(tenantId, id);

    const group = await this.prisma.ringGroup.update({
      where: { id },
      data: {
        ...dto,
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: ringGroupInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ring_group.update',
      entityType: 'RingGroup',
      entityId: id,
      metadata: { ...dto },
    });

    return group;
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.requireGroup(tenantId, id);
    await this.prisma.ringGroup.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ring_group.delete',
      entityType: 'RingGroup',
      entityId: id,
    });

    return { ok: true };
  }

  async clone(tenantId: string, userId: string, id: string, dto: CloneRingGroupDto) {
    const source = await this.getById(tenantId, id);
    const cloned = await this.create(tenantId, userId, {
      name: dto.name,
      description: source.description ?? undefined,
      extension: undefined,
      phoneNumberId: source.phoneNumberId ?? undefined,
      strategy: source.strategy,
      timeoutSec: source.timeoutSec,
      retryCount: source.retryCount,
      maxCycles: source.maxCycles,
      callerIdName: source.callerIdName ?? undefined,
      recordingPolicyId: source.recordingPolicyId ?? undefined,
      voicemailLineId: source.voicemailLineId ?? undefined,
      timeConditionId: source.timeConditionId ?? undefined,
      holidayCalendarId: source.holidayCalendarId ?? undefined,
      mohPlaylistId: source.mohPlaylistId ?? undefined,
      announcementId: source.announcementId ?? undefined,
      overflowDestinationType: source.overflowDestinationType ?? undefined,
      overflowDestinationId: source.overflowDestinationId ?? undefined,
      status: source.status,
    });

    for (const member of source.members) {
      await this.addMember(tenantId, userId, cloned.id, {
        extensionId: member.extensionId,
        priority: member.priority,
        penalty: member.penalty,
        enabled: member.enabled,
        ringDelaySec: member.ringDelaySec,
        maxCalls: member.maxCalls ?? undefined,
        busySkip: member.busySkip,
        wrapUpSec: member.wrapUpSec,
        memberOrder: member.memberOrder,
      });
    }

    return this.getById(tenantId, cloned.id);
  }

  async addMember(tenantId: string, userId: string, ringGroupId: string, dto: RingGroupMemberDto) {
    await this.requireGroup(tenantId, ringGroupId);
    const ext = await this.prisma.extension.findFirst({
      where: { id: dto.extensionId, ...tenantScope(tenantId) },
    });
    if (!ext) throw new NotFoundException('Extension not found');

    const member = await this.prisma.ringGroupMember.create({
      data: {
        id: randomUUID(),
        tenantId,
        ringGroupId,
        extensionId: dto.extensionId,
        priority: dto.priority ?? 0,
        penalty: dto.penalty ?? 0,
        enabled: dto.enabled ?? true,
        ringDelaySec: dto.ringDelaySec ?? 0,
        maxCalls: dto.maxCalls,
        busySkip: dto.busySkip ?? false,
        wrapUpSec: dto.wrapUpSec ?? 0,
        memberOrder: dto.memberOrder ?? 0,
      },
      include: { extension: { select: { id: true, extension: true } } },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ring_group.member.add',
      entityType: 'RingGroupMember',
      entityId: member.id,
      metadata: { ringGroupId, extensionId: dto.extensionId },
    });

    return member;
  }

  async updateMember(
    tenantId: string,
    userId: string,
    ringGroupId: string,
    memberId: string,
    dto: RingGroupMemberDto,
  ) {
    await this.requireGroup(tenantId, ringGroupId);
    const member = await this.requireMember(tenantId, ringGroupId, memberId);

    const updated = await this.prisma.ringGroupMember.update({
      where: { id: member.id },
      data: {
        priority: dto.priority,
        penalty: dto.penalty,
        enabled: dto.enabled,
        ringDelaySec: dto.ringDelaySec,
        maxCalls: dto.maxCalls,
        busySkip: dto.busySkip,
        wrapUpSec: dto.wrapUpSec,
        memberOrder: dto.memberOrder,
      },
      include: { extension: { select: { id: true, extension: true } } },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ring_group.member.update',
      entityType: 'RingGroupMember',
      entityId: memberId,
      metadata: { ...dto },
    });

    return updated;
  }

  async replaceMembers(tenantId: string, userId: string, ringGroupId: string, dto: BulkRingGroupMembersDto) {
    await this.requireGroup(tenantId, ringGroupId);

    await this.prisma.ringGroupMember.updateMany({
      where: { ringGroupId, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    const created = [];
    for (const m of dto.members) {
      created.push(await this.addMember(tenantId, userId, ringGroupId, m));
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ring_group.members.bulk_update',
      entityType: 'RingGroup',
      entityId: ringGroupId,
      metadata: { count: dto.members.length },
    });

    return { members: created };
  }

  async removeMember(tenantId: string, userId: string, ringGroupId: string, memberId: string) {
    await this.requireGroup(tenantId, ringGroupId);
    const member = await this.requireMember(tenantId, ringGroupId, memberId);

    await this.prisma.ringGroupMember.update({
      where: { id: member.id },
      data: { deletedAt: new Date() },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ring_group.member.remove',
      entityType: 'RingGroupMember',
      entityId: memberId,
    });

    return { ok: true };
  }

  async bulkImport(tenantId: string, userId: string, dto: BulkImportRingGroupsDto) {
    const results: { name: string; ok: boolean; id?: string; error?: string }[] = [];

    for (const row of dto.rows) {
      try {
        const group = await this.create(tenantId, userId, {
          name: row.name,
          description: row.description,
          strategy: row.strategy,
          timeoutSec: row.timeoutSec,
          extension: row.extension,
        });

        if (row.memberExtensions?.length) {
          for (let i = 0; i < row.memberExtensions.length; i++) {
            const extNum = row.memberExtensions[i];
            const ext = await this.prisma.extension.findFirst({
              where: { tenantId, extension: extNum, deletedAt: null },
            });
            if (ext) {
              await this.addMember(tenantId, userId, group.id, {
                extensionId: ext.id,
                memberOrder: i,
              });
            }
          }
        }

        results.push({ name: row.name, ok: true, id: group.id });
      } catch (err) {
        results.push({
          name: row.name,
          ok: false,
          error: err instanceof Error ? err.message : 'Import failed',
        });
      }
    }

    return { results };
  }

  async exportJson(tenantId: string) {
    const groups = await this.list(tenantId);
    return groups.map((g) => ({
      name: g.name,
      description: g.description,
      extension: g.extension,
      strategy: g.strategy,
      timeoutSec: g.timeoutSec,
      retryCount: g.retryCount,
      maxCycles: g.maxCycles,
      status: g.status,
      members: g.members.map((m) => ({
        extension: m.extension.extension,
        priority: m.priority,
        penalty: m.penalty,
        enabled: m.enabled,
        ringDelaySec: m.ringDelaySec,
        memberOrder: m.memberOrder,
      })),
    }));
  }

  async exportCsv(tenantId: string): Promise<string> {
    const groups = await this.list(tenantId);
    const header = 'id,name,extension,strategy,timeoutSec,members,status';
    const lines = groups.map((g) =>
      [
        g.id,
        csvEscape(g.name),
        g.extension ?? '',
        g.strategy,
        g.timeoutSec,
        g.members.length,
        g.status,
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }

  private async requireGroup(tenantId: string, id: string) {
    const row = await this.prisma.ringGroup.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Ring group not found');
    return row;
  }

  private async requireMember(tenantId: string, ringGroupId: string, memberId: string) {
    const member = await this.prisma.ringGroupMember.findFirst({
      where: { id: memberId, ringGroupId, tenantId, deletedAt: null },
    });
    if (!member) throw new NotFoundException('Ring group member not found');
    return member;
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
