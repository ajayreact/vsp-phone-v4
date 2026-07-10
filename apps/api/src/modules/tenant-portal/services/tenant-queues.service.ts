import { Injectable, NotFoundException } from '@nestjs/common';
import { CallLifecycleState, Prisma, QueueCallbackStatus, QueueMemberStatus, QueueStatus, QueueStrategy, QueueType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import type {
  AgentPauseDto,
  BulkImportQueuesDto,
  BulkQueueMembersDto,
  CloneQueueDto,
  CreateQueueCallbackDto,
  CreateQueueDto,
  QueueMemberDto,
  QueueStateDto,
  UpdateQueueDto,
} from '../dto/tenant-queues.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { newPublicId, tenantScope } from '../utils/tenant.util';

const queueInclude = {
  members: {
    where: { deletedAt: null },
    orderBy: { priority: 'asc' },
    include: {
      line: {
        select: {
          id: true,
          name: true,
          user: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
          extension: { select: { extension: true } },
          presence: true,
        },
      },
    },
  },
  callbacks: {
    where: {
      deletedAt: null,
      status: { in: [QueueCallbackStatus.PENDING, QueueCallbackStatus.SCHEDULED] },
    },
    take: 50,
    orderBy: { priority: 'desc' },
  },
} satisfies Prisma.QueueInclude;

@Injectable()
export class TenantQueuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string, search?: string) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { code: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.queue.findMany({
      where,
      include: queueInclude,
      orderBy: { name: 'asc' },
      take: 500,
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.queue.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: queueInclude,
    });
    if (!row) throw new NotFoundException('Queue not found');
    return row;
  }

  async create(tenantId: string, userId: string, dto: CreateQueueDto) {
    const queue = await this.prisma.queue.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('q'),
        tenantId,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        queueType: dto.queueType ?? QueueType.SALES,
        strategy: dto.strategy ?? QueueStrategy.ROUND_ROBIN,
        status: dto.status ?? QueueStatus.ACTIVE,
        wrapUpSec: dto.wrapUpSec ?? 0,
        slaTargetSec: dto.slaTargetSec,
        maxWaitSec: dto.maxWaitSec,
        maxQueueLength: dto.maxQueueLength,
        overflowDestinationType: dto.overflowDestinationType,
        overflowDestinationId: dto.overflowDestinationId,
        overflowQueueId: dto.overflowQueueId,
        callbackEnabled: dto.callbackEnabled ?? false,
        scheduledCallbackEnabled: dto.scheduledCallbackEnabled ?? false,
        priorityCallbackEnabled: dto.priorityCallbackEnabled ?? false,
        positionAnnouncementEnabled: dto.positionAnnouncementEnabled ?? false,
        estimatedWaitAnnouncementEnabled: dto.estimatedWaitAnnouncementEnabled ?? false,
        timeConditionId: dto.timeConditionId,
        holidayCalendarId: dto.holidayCalendarId,
        mohPlaylistId: dto.mohPlaylistId,
        announcementId: dto.announcementId,
        recordingPolicyId: dto.recordingPolicyId,
        createdBy: userId,
      },
      include: queueInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.queue.create',
      entityType: 'Queue',
      entityId: queue.id,
      metadata: { name: dto.name, code: dto.code },
    });

    return queue;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateQueueDto) {
    await this.requireQueue(tenantId, id);

    const queue = await this.prisma.queue.update({
      where: { id },
      data: {
        ...dto,
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: queueInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.queue.update',
      entityType: 'Queue',
      entityId: id,
      metadata: { ...dto },
    });

    return queue;
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.requireQueue(tenantId, id);
    await this.prisma.queue.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.queue.delete',
      entityType: 'Queue',
      entityId: id,
    });

    return { ok: true };
  }

  async clone(tenantId: string, userId: string, id: string, dto: CloneQueueDto) {
    const source = await this.getById(tenantId, id);
    const cloned = await this.create(tenantId, userId, {
      name: dto.name,
      code: dto.code,
      description: source.description ?? undefined,
      queueType: source.queueType,
      strategy: source.strategy,
      status: QueueStatus.ACTIVE,
      wrapUpSec: source.wrapUpSec,
      slaTargetSec: source.slaTargetSec ?? undefined,
      maxWaitSec: source.maxWaitSec ?? undefined,
      maxQueueLength: source.maxQueueLength ?? undefined,
      overflowDestinationType: source.overflowDestinationType ?? undefined,
      overflowDestinationId: source.overflowDestinationId ?? undefined,
      overflowQueueId: source.overflowQueueId ?? undefined,
      callbackEnabled: source.callbackEnabled,
      scheduledCallbackEnabled: source.scheduledCallbackEnabled,
      priorityCallbackEnabled: source.priorityCallbackEnabled,
      positionAnnouncementEnabled: source.positionAnnouncementEnabled,
      estimatedWaitAnnouncementEnabled: source.estimatedWaitAnnouncementEnabled,
      timeConditionId: source.timeConditionId ?? undefined,
      holidayCalendarId: source.holidayCalendarId ?? undefined,
      mohPlaylistId: source.mohPlaylistId ?? undefined,
      announcementId: source.announcementId ?? undefined,
      recordingPolicyId: source.recordingPolicyId ?? undefined,
    });

    for (const member of source.members) {
      await this.addMember(tenantId, userId, cloned.id, {
        lineId: member.lineId,
        priority: member.priority,
        penalty: member.penalty,
        status: member.status,
        enabled: member.enabled,
        maxConcurrentCalls: member.maxConcurrentCalls,
        skills: member.skills as Record<string, unknown> | undefined,
      });
    }

    return this.getById(tenantId, cloned.id);
  }

  async listMembers(tenantId: string, queueId: string) {
    await this.requireQueue(tenantId, queueId);
    return this.prisma.queueMember.findMany({
      where: { queueId, ...tenantScope(tenantId) },
      include: queueInclude.members.include,
      orderBy: { priority: 'asc' },
    });
  }

  async addMember(tenantId: string, userId: string, queueId: string, dto: QueueMemberDto) {
    await this.requireQueue(tenantId, queueId);
    const line = await this.prisma.line.findFirst({
      where: { id: dto.lineId, tenantId, deletedAt: null },
    });
    if (!line) throw new NotFoundException('Line not found');

    const member = await this.prisma.queueMember.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('qm'),
        tenantId,
        queueId,
        lineId: dto.lineId,
        priority: dto.priority ?? 0,
        penalty: dto.penalty ?? 0,
        status: dto.status ?? QueueMemberStatus.ACTIVE,
        enabled: dto.enabled ?? true,
        maxConcurrentCalls: dto.maxConcurrentCalls ?? 1,
        skills: dto.skills as Prisma.InputJsonValue | undefined,
        loggedIn: true,
        createdBy: userId,
      },
      include: queueInclude.members.include,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.queue.member.add',
      entityType: 'QueueMember',
      entityId: member.id,
      metadata: { queueId, lineId: dto.lineId },
    });

    return member;
  }

  async updateMember(tenantId: string, userId: string, queueId: string, memberId: string, dto: QueueMemberDto) {
    await this.requireQueue(tenantId, queueId);
    const member = await this.requireMember(tenantId, queueId, memberId);

    const updated = await this.prisma.queueMember.update({
      where: { id: member.id },
      data: {
        priority: dto.priority,
        penalty: dto.penalty,
        status: dto.status,
        enabled: dto.enabled,
        maxConcurrentCalls: dto.maxConcurrentCalls,
        skills: dto.skills as Prisma.InputJsonValue | undefined,
        updatedBy: userId,
      },
      include: queueInclude.members.include,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.queue.member.update',
      entityType: 'QueueMember',
      entityId: memberId,
      metadata: { ...dto },
    });

    return updated;
  }

  async replaceMembers(tenantId: string, userId: string, queueId: string, dto: BulkQueueMembersDto) {
    await this.requireQueue(tenantId, queueId);

    await this.prisma.queueMember.updateMany({
      where: { queueId, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    const created = [];
    for (const m of dto.members) {
      created.push(await this.addMember(tenantId, userId, queueId, m));
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.queue.members.bulk_update',
      entityType: 'Queue',
      entityId: queueId,
      metadata: { count: dto.members.length },
    });

    return { members: created };
  }

  async removeMember(tenantId: string, userId: string, queueId: string, memberId: string) {
    await this.requireQueue(tenantId, queueId);
    const member = await this.requireMember(tenantId, queueId, memberId);

    await this.prisma.queueMember.update({
      where: { id: member.id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.queue.member.remove',
      entityType: 'QueueMember',
      entityId: memberId,
    });

    return { ok: true };
  }

  async agentLogin(tenantId: string, userId: string, queueId: string, memberId: string) {
    const member = await this.setAgentState(tenantId, userId, queueId, memberId, {
      loggedIn: true,
      status: QueueMemberStatus.ACTIVE,
      pausedReason: null,
      pausedAt: null,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.queue.agent.login',
      entityType: 'QueueMember',
      entityId: memberId,
    });
    return member;
  }

  async agentLogout(tenantId: string, userId: string, queueId: string, memberId: string) {
    const member = await this.setAgentState(tenantId, userId, queueId, memberId, {
      loggedIn: false,
      status: QueueMemberStatus.INACTIVE,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.queue.agent.logout',
      entityType: 'QueueMember',
      entityId: memberId,
    });
    return member;
  }

  async agentPause(tenantId: string, userId: string, queueId: string, memberId: string, dto: AgentPauseDto) {
    const member = await this.setAgentState(tenantId, userId, queueId, memberId, {
      status: QueueMemberStatus.PAUSED,
      pausedReason: dto.reason ?? 'Paused',
      pausedAt: new Date(),
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.queue.agent.pause',
      entityType: 'QueueMember',
      entityId: memberId,
      metadata: { reason: dto.reason },
    });
    return member;
  }

  async agentResume(tenantId: string, userId: string, queueId: string, memberId: string) {
    const member = await this.setAgentState(tenantId, userId, queueId, memberId, {
      status: QueueMemberStatus.ACTIVE,
      pausedReason: null,
      pausedAt: null,
      loggedIn: true,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.queue.agent.resume',
      entityType: 'QueueMember',
      entityId: memberId,
    });
    return member;
  }

  async setQueueState(tenantId: string, userId: string, queueId: string, dto: QueueStateDto) {
    await this.requireQueue(tenantId, queueId);

    const existingRaw = await this.redis.get(this.queueStateKey(tenantId, queueId));
    const existing = existingRaw ? (JSON.parse(existingRaw) as Record<string, unknown>) : {};
    const next = { ...existing, ...dto, updatedAt: new Date().toISOString() };
    await this.redis.setex(this.queueStateKey(tenantId, queueId), 86400, JSON.stringify(next));

    let status: QueueStatus | undefined;
    if (dto.emergencyClosed) status = QueueStatus.EMERGENCY_CLOSED;
    else if (dto.paused) status = QueueStatus.PAUSED;
    else if (dto.paused === false || dto.emergencyClosed === false) status = QueueStatus.ACTIVE;

    if (status) {
      await this.prisma.queue.update({
        where: { id: queueId },
        data: { status, updatedBy: userId },
      });
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.queue.state',
      entityType: 'Queue',
      entityId: queueId,
      metadata: { ...dto },
    });

    return next;
  }

  async createCallback(tenantId: string, userId: string, queueId: string, dto: CreateQueueCallbackDto) {
    const queue = await this.requireQueue(tenantId, queueId);
    if (!queue.callbackEnabled) {
      throw new NotFoundException('Callback not enabled for this queue');
    }

    const callback = await this.prisma.queueCallback.create({
      data: {
        id: randomUUID(),
        tenantId,
        queueId,
        phoneNumber: dto.phoneNumber,
        callerName: dto.callerName,
        priority: dto.priority ?? 0,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        createdBy: userId,
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.queue.callback.create',
      entityType: 'QueueCallback',
      entityId: callback.id,
      metadata: { queueId, phoneNumber: dto.phoneNumber },
    });

    return callback;
  }

  async listCallbacks(tenantId: string, queueId: string) {
    await this.requireQueue(tenantId, queueId);
    return this.prisma.queueCallback.findMany({
      where: { queueId, tenantId, deletedAt: null },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    });
  }

  async getDashboard(tenantId: string, queueId?: string) {
    const queues = queueId
      ? [await this.getById(tenantId, queueId)]
      : await this.list(tenantId);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const slaThreshold = (q: { slaTargetSec: number | null }) => q.slaTargetSec ?? 20;

    const results = [];
    for (const q of queues) {
      const depthRaw = await this.redis.get(this.redis.queueDepthKey(tenantId, q.id));
      const waitingCalls = Number(depthRaw ?? 0);

      const sessions = await this.prisma.callSession.findMany({
        where: {
          tenantId,
          queueId: q.id,
          deletedAt: null,
          startedAt: { gte: todayStart },
        },
        select: {
          startedAt: true,
          answeredAt: true,
          endedAt: true,
          state: true,
          createdAt: true,
        },
      });

      let longestWaitSec = 0;
      let totalWaitMs = 0;
      let totalHandleMs = 0;
      let handleCount = 0;
      let waitCount = 0;
      let abandoned = 0;
      let answered = 0;
      let slaMet = 0;

      for (const s of sessions) {
        if (s.answeredAt) {
          answered += 1;
          const waitMs = s.answeredAt.getTime() - (s.startedAt?.getTime() ?? s.createdAt.getTime());
          totalWaitMs += Math.max(0, waitMs);
          waitCount += 1;
          if (waitMs / 1000 <= slaThreshold(q)) slaMet += 1;
          if (s.endedAt) {
            totalHandleMs += Math.max(0, s.endedAt.getTime() - s.answeredAt.getTime());
            handleCount += 1;
          }
        } else if (s.state === CallLifecycleState.ENDED) {
          abandoned += 1;
        }
        if (s.state === CallLifecycleState.RINGING || s.state === CallLifecycleState.CREATED) {
          const w = Math.floor((Date.now() - (s.startedAt ?? s.createdAt).getTime()) / 1000);
          if (w > longestWaitSec) longestWaitSec = w;
        }
      }

      const agentsAvailable = q.members.filter(
        (m) => m.enabled && m.loggedIn && m.status === QueueMemberStatus.ACTIVE,
      ).length;
      const agentsBusy = q.members.filter((m) => m.status === QueueMemberStatus.WRAP_UP).length;
      const agentsPaused = q.members.filter((m) => m.status === QueueMemberStatus.PAUSED).length;
      const offered = sessions.length;
      const occupancy =
        agentsAvailable + agentsBusy > 0
          ? Math.round((agentsBusy / (agentsAvailable + agentsBusy)) * 1000) / 10
          : 0;

      results.push({
        id: q.id,
        name: q.name,
        code: q.code,
        queueType: q.queueType,
        strategy: q.strategy,
        status: q.status,
        waitingCalls,
        agentsAvailable,
        agentsBusy,
        agentsPaused,
        agentsLoggedIn: q.members.filter((m) => m.loggedIn && m.enabled).length,
        longestWaitSec: Math.max(longestWaitSec, waitingCalls > 0 ? longestWaitSec : 0),
        averageWaitSec: waitCount > 0 ? Math.round(totalWaitMs / waitCount / 1000) : 0,
        averageHandleSec: handleCount > 0 ? Math.round(totalHandleMs / handleCount / 1000) : 0,
        slaPct: answered > 0 ? Math.round((slaMet / answered) * 1000) / 10 : 100,
        abandonPct: offered > 0 ? Math.round((abandoned / offered) * 1000) / 10 : 0,
        occupancyPct: occupancy,
        callsToday: offered,
        answeredToday: answered,
        missedToday: abandoned,
        pendingCallbacks: q.callbacks?.length ?? 0,
      });
    }

    return results;
  }

  async getReports(tenantId: string, queueId: string) {
    const dashboard = await this.getDashboard(tenantId, queueId);
    const stats = dashboard[0];
    if (!stats) throw new NotFoundException('Queue not found');

    return {
      queueId,
      period: 'today',
      slaPct: stats.slaPct,
      abandonPct: stats.abandonPct,
      averageWaitSec: stats.averageWaitSec,
      averageHandleSec: stats.averageHandleSec,
      callsAnswered: stats.answeredToday,
      missedCalls: stats.missedToday,
      callsOffered: stats.callsToday,
      transfers: 0,
    };
  }

  async bulkImport(tenantId: string, userId: string, dto: BulkImportQueuesDto) {
    const results: { name: string; ok: boolean; id?: string; error?: string }[] = [];
    for (const row of dto.rows) {
      try {
        const queue = await this.create(tenantId, userId, row);
        results.push({ name: row.name, ok: true, id: queue.id });
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
    const queues = await this.list(tenantId);
    return queues.map((q) => ({
      name: q.name,
      code: q.code,
      description: q.description,
      queueType: q.queueType,
      strategy: q.strategy,
      status: q.status,
      wrapUpSec: q.wrapUpSec,
      slaTargetSec: q.slaTargetSec,
      maxWaitSec: q.maxWaitSec,
      maxQueueLength: q.maxQueueLength,
      callbackEnabled: q.callbackEnabled,
      members: q.members.map((m) => ({
        lineId: m.lineId,
        priority: m.priority,
        penalty: m.penalty,
        maxConcurrentCalls: m.maxConcurrentCalls,
      })),
    }));
  }

  async exportCsv(tenantId: string): Promise<string> {
    const queues = await this.list(tenantId);
    const header = 'id,name,code,queueType,strategy,status,members,slaTargetSec,maxWaitSec';
    const lines = queues.map((q) =>
      [
        q.id,
        csvEscape(q.name),
        q.code,
        q.queueType,
        q.strategy,
        q.status,
        q.members.length,
        q.slaTargetSec ?? '',
        q.maxWaitSec ?? '',
      ].join(','),
    );
    return [header, ...lines].join('\n');
  }

  private async setAgentState(
    tenantId: string,
    userId: string,
    queueId: string,
    memberId: string,
    data: Partial<{
      loggedIn: boolean;
      status: QueueMemberStatus;
      pausedReason: string | null;
      pausedAt: Date | null;
    }>,
  ) {
    await this.requireQueue(tenantId, queueId);
    const member = await this.requireMember(tenantId, queueId, memberId);
    return this.prisma.queueMember.update({
      where: { id: member.id },
      data: { ...data, updatedBy: userId },
      include: queueInclude.members.include,
    });
  }

  private queueStateKey(tenantId: string, queueId: string) {
    return `vsp:${tenantId}:tenant:queue:${queueId}:state`;
  }

  private async requireQueue(tenantId: string, id: string) {
    const row = await this.prisma.queue.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Queue not found');
    return row;
  }

  private async requireMember(tenantId: string, queueId: string, memberId: string) {
    const member = await this.prisma.queueMember.findFirst({
      where: { id: memberId, queueId, ...tenantScope(tenantId) },
    });
    if (!member) throw new NotFoundException('Queue member not found');
    return member;
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
