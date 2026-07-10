import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CallLifecycleState, PresenceStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { SupervisorMonitorService } from '../../enterprise-ops/runtime/supervisor-monitor.service';
import { PresenceService } from '../../presence/presence.service';
import { CALL_EVENTS } from '../../telecom/events/call.events';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { SupervisorEventsService } from './supervisor-events.service';

@Injectable()
export class SupervisorActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly supervisor: SupervisorMonitorService,
    private readonly events: EventEmitter2,
    private readonly presence: PresenceService,
    private readonly audit: EnterpriseAuditService,
    private readonly stream: SupervisorEventsService,
  ) {}

  async listen(tenantId: string, actorUserId: string, platformUuid: string, supervisorLineId?: string) {
    return this.supervisorJoin(tenantId, actorUserId, platformUuid, 'monitor', supervisorLineId);
  }

  async whisper(tenantId: string, actorUserId: string, platformUuid: string, supervisorLineId?: string) {
    return this.supervisorJoin(tenantId, actorUserId, platformUuid, 'whisper', supervisorLineId);
  }

  async barge(tenantId: string, actorUserId: string, platformUuid: string, supervisorLineId?: string) {
    return this.supervisorJoin(tenantId, actorUserId, platformUuid, 'barge', supervisorLineId);
  }

  async takeOver(tenantId: string, actorUserId: string, platformUuid: string, supervisorLineId?: string) {
    return this.supervisorJoin(tenantId, actorUserId, platformUuid, 'barge', supervisorLineId);
  }

  private telecomMeta(platformUuid: string): { requestId: string; correlationId: string; platformUuid: string; idempotencyKey: string } {
    const id = randomUUID();
    return { requestId: id, correlationId: id, platformUuid, idempotencyKey: id };
  }

  async endSupervision(tenantId: string, actorUserId: string, platformUuid: string) {
    await this.supervisor.end({
      targetPlatformUuid: platformUuid,
      meta: this.telecomMeta(platformUuid),
    });
    await this.logAction(tenantId, actorUserId, 'supervisor.supervision.ended', platformUuid, {});
    this.stream.publish(tenantId, { type: 'supervision_ended', platformUuid });
    return { ok: true };
  }

  async hangUp(tenantId: string, actorUserId: string, platformUuid: string) {
    const session = await this.prisma.callSession.findFirst({
      where: { tenantId, platformUuid, deletedAt: null },
    });
    if (!session) throw new NotFoundException('Call not found');

    await this.prisma.callSession.update({
      where: { id: session.id },
      data: { state: CallLifecycleState.ENDED, endedAt: new Date() },
    });
    this.events.emit(CALL_EVENTS.ENDED, {
      eventId: randomUUID(),
      type: CALL_EVENTS.ENDED,
      tenantId,
      platformUuid,
      callSessionId: session.id,
      cause: 'supervisor_hangup',
      ts: new Date().toISOString(),
    });

    await this.logAction(tenantId, actorUserId, 'supervisor.call.hangup', platformUuid, { callSessionId: session.id });
    this.stream.publish(tenantId, { type: 'call_ended', platformUuid });
    return { ok: true };
  }

  async transfer(tenantId: string, actorUserId: string, platformUuid: string, target: string) {
    const session = await this.prisma.callSession.findFirst({
      where: { tenantId, platformUuid, deletedAt: null },
    });
    if (!session) throw new NotFoundException('Call not found');

    await this.redis.setex(
      this.redis.callRuntimeKey(tenantId, platformUuid),
      3600,
      JSON.stringify({ transferPending: true, transferTarget: target, transferBy: actorUserId }),
    );

    await this.logAction(tenantId, actorUserId, 'supervisor.call.transfer', platformUuid, { target });
    this.stream.publish(tenantId, { type: 'call_transfer', platformUuid, target });
    return { ok: true, target };
  }

  async pauseAgent(tenantId: string, actorUserId: string, lineId: string, reason?: string) {
    await this.presence.setLinePresence({
      tenantId,
      lineId,
      status: PresenceStatus.AWAY,
      source: 'admin',
      customMessage: reason ?? 'Supervisor pause',
      skipOverride: true,
    });
    await this.redis.setex(
      `vsp:${tenantId}:supervisor:agent:${lineId}`,
      86400,
      JSON.stringify({ reason: reason ?? 'Supervisor pause', pausedAt: new Date().toISOString(), by: actorUserId }),
    );
    await this.logAction(tenantId, actorUserId, 'supervisor.agent.paused', lineId, { reason });
    this.stream.publish(tenantId, { type: 'agent_paused', lineId });
    return { ok: true };
  }

  async resumeAgent(tenantId: string, actorUserId: string, lineId: string) {
    await this.redis.del(`vsp:${tenantId}:supervisor:agent:${lineId}`);
    await this.presence.setLinePresence({
      tenantId,
      lineId,
      status: PresenceStatus.AVAILABLE,
      source: 'admin',
      skipOverride: true,
    });
    await this.logAction(tenantId, actorUserId, 'supervisor.agent.resumed', lineId, {});
    this.stream.publish(tenantId, { type: 'agent_resumed', lineId });
    return { ok: true };
  }

  async forceLogout(tenantId: string, actorUserId: string, lineId: string) {
    await this.presence.setLinePresence({
      tenantId,
      lineId,
      status: PresenceStatus.OFFLINE,
      source: 'admin',
      skipOverride: true,
    });
    await this.redis.del(`vsp:${tenantId}:supervisor:agent:${lineId}`);
    await this.logAction(tenantId, actorUserId, 'supervisor.agent.force_logout', lineId, {});
    this.stream.publish(tenantId, { type: 'agent_force_logout', lineId });
    return { ok: true };
  }

  async moveAgent(tenantId: string, actorUserId: string, lineId: string, queueId: string) {
    const member = await this.prisma.queueMember.findFirst({
      where: { tenantId, lineId, deletedAt: null },
    });
    if (!member) throw new NotFoundException('Agent not in a queue');

    await this.prisma.queueMember.update({
      where: { id: member.id },
      data: { queueId },
    });

    await this.logAction(tenantId, actorUserId, 'supervisor.agent.moved', lineId, { queueId });
    this.stream.publish(tenantId, { type: 'agent_moved', lineId, queueId });
    return { ok: true };
  }

  async emergencyStop(tenantId: string, actorUserId: string) {
    const queues = await this.prisma.queue.findMany({ where: { tenantId, deletedAt: null }, select: { id: true } });
    for (const q of queues) {
      await this.redis.setex(
        `vsp:${tenantId}:supervisor:queue:${q.id}`,
        86400,
        JSON.stringify({ emergencyClosed: true, paused: true, updatedAt: new Date().toISOString() }),
      );
    }
    await this.logAction(tenantId, actorUserId, 'supervisor.emergency_stop', tenantId, { queueCount: queues.length });
    this.stream.publish(tenantId, { type: 'emergency_stop', queueCount: queues.length });
    return { ok: true, queuesAffected: queues.length };
  }

  private async supervisorJoin(
    tenantId: string,
    actorUserId: string,
    platformUuid: string,
    mode: 'monitor' | 'whisper' | 'barge',
    supervisorLineId?: string,
  ) {
    const session = await this.prisma.callSession.findFirst({
      where: { tenantId, platformUuid, deletedAt: null },
    });
    if (!session) throw new NotFoundException('Call not found');

    const result = await this.supervisor.join({
      targetPlatformUuid: platformUuid,
      mode,
      supervisorLineId,
      meta: this.telecomMeta(platformUuid),
    });

    await this.logAction(tenantId, actorUserId, `supervisor.call.${mode}`, platformUuid, {
      callSessionId: session.id,
      supervisorLineId,
    });
    this.stream.publish(tenantId, { type: `supervisor_${mode}`, platformUuid, mode });
    return result;
  }

  private async logAction(
    tenantId: string,
    actorUserId: string,
    action: string,
    resourceId: string,
    detail: Record<string, unknown>,
  ) {
    await this.audit.append({
      tenantId,
      actorUserId,
      actorType: 'supervisor',
      action,
      resourceType: 'call_session',
      resourceId,
      detail,
    });
  }
}
