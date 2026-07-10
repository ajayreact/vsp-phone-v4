import { Injectable, NotFoundException } from '@nestjs/common';
import { CallLifecycleState } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { ParkRuntimeService } from '../../enterprise-ops/runtime/park-runtime.service';
import { PickupRuntimeService } from '../../enterprise-ops/runtime/pickup-runtime.service';
import { LiveCallsAdminService } from '../../carrier-admin/services/live-calls-admin.service';
import { PresenceService } from '../../presence/presence.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import type {
  CreateParkingLotDto,
  ParkCallDto,
  PickupCallDto,
  ReceptionCallActionDto,
  ReceptionHoldDto,
  ReceptionMuteDto,
  ReceptionTransferDto,
  RetrieveParkedCallDto,
  SetOperatorPresenceDto,
  UpdateParkingLotDto,
} from '../dto/tenant-reception.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { newPublicId, tenantScope } from '../utils/tenant.util';
import { TenantReceptionEventsService } from './tenant-reception-events.service';
import { TenantQueuesService } from './tenant-queues.service';

@Injectable()
export class TenantReceptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly park: ParkRuntimeService,
    private readonly pickup: PickupRuntimeService,
    private readonly liveCalls: LiveCallsAdminService,
    private readonly presence: PresenceService,
    private readonly queues: TenantQueuesService,
    private readonly audit: EnterpriseAuditService,
    private readonly events: TenantReceptionEventsService,
  ) {}

  async getDashboard(tenantId: string) {
    const [liveCalls, queueDashboard, parked, presences] = await Promise.all([
      this.listLiveCalls(tenantId),
      this.queues.getDashboard(tenantId),
      this.listParkedCalls(tenantId),
      this.prisma.connected
        ? this.prisma.presence.groupBy({
            by: ['status'],
            where: { tenantId, deletedAt: null },
            _count: true,
          })
        : Promise.resolve([]),
    ]);

    return {
      activeCalls: liveCalls.length,
      parkedCalls: parked.length,
      queues: queueDashboard,
      presenceSummary: presences.reduce(
        (acc, p) => ({ ...acc, [p.status]: p._count }),
        {} as Record<string, number>,
      ),
    };
  }

  async listLiveCalls(tenantId: string) {
    const rows = await this.liveCalls.listActive({ tenantId, limit: 200 });
    return Promise.all(
      rows.map(async (r) => {
        const session = await this.prisma.callSession.findFirst({
          where: { platformUuid: r.platformUuid, tenantId, deletedAt: null },
          include: {
            queue: { select: { name: true } },
            fromLine: { include: { user: { include: { profile: true } }, extension: true } },
            toLine: { include: { extension: true, presence: true } },
          },
        });
        const runtimeRaw = await this.redis.get(this.redis.callRuntimeKey(tenantId, r.platformUuid));
        let onHold = false;
        let muted = false;
        if (runtimeRaw) {
          try {
            const rt = JSON.parse(runtimeRaw) as { onHold?: boolean; muted?: boolean; transferPending?: boolean };
            onHold = rt.onHold ?? false;
            muted = rt.muted ?? false;
          } catch {
            /* ignore */
          }
        }
        return {
          ...r,
          callSessionId: session?.id,
          state: session?.state ?? null,
          queueName: session?.queue?.name ?? null,
          fromExtension: session?.fromLine?.extension?.extension ?? r.extension,
          fromName: session?.fromLine?.user?.profile?.displayName ?? null,
          toExtension: session?.toLine?.extension?.extension ?? null,
          toPresence: session?.toLine?.presence?.status ?? null,
          onHold,
          muted,
        };
      }),
    );
  }

  async listParkingLots(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.parkingLot.findMany({
      where: tenantScope(tenantId),
      orderBy: { name: 'asc' },
    });
  }

  async createParkingLot(tenantId: string, userId: string, dto: CreateParkingLotDto) {
    const lot = await this.prisma.parkingLot.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('park'),
        tenantId,
        name: dto.name,
        code: dto.code,
        slotStart: dto.slotStart ?? 1,
        slotCount: dto.slotCount ?? 20,
        timeoutSec: dto.timeoutSec ?? 300,
        overflowDestination: dto.overflowDestination,
        createdBy: userId,
      },
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.parking_lot.create',
      entityType: 'ParkingLot',
      entityId: lot.id,
      metadata: { publicId: lot.publicId },
    });
    return lot;
  }

  async updateParkingLot(tenantId: string, userId: string, id: string, dto: UpdateParkingLotDto) {
    const lot = await this.prisma.parkingLot.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!lot) throw new NotFoundException('Parking lot not found');
    return this.prisma.parkingLot.update({
      where: { id },
      data: { ...dto, updatedBy: userId },
    });
  }

  async listParkedCalls(tenantId: string, parkingLotId?: string) {
    const lots = parkingLotId
      ? await this.prisma.parkingLot.findMany({ where: { id: parkingLotId, tenantId, deletedAt: null } })
      : await this.prisma.parkingLot.findMany({ where: { tenantId, deletedAt: null } });

    const configs = lots.length ? lots : [{ slotStart: 1, slotCount: 20, name: 'Default', id: null }];
    const parked: Array<Record<string, unknown>> = [];

    for (const lot of configs) {
      for (let i = lot.slotStart; i < lot.slotStart + lot.slotCount; i++) {
        const slot = String(i).padStart(2, '0');
        const raw = await this.redis.get(this.redis.parkSlotKey(tenantId, slot));
        if (!raw) continue;
        try {
          const data = JSON.parse(raw) as {
            platformUuid: string;
            callSessionId: string;
            parkedByLineId?: string;
            parkedAt?: string;
          };
          parked.push({
            slot,
            parkingLotId: lot.id,
            parkingLotName: lot.name,
            ...data,
          });
        } catch {
          /* ignore */
        }
      }
    }
    return parked;
  }

  async parkCall(tenantId: string, userId: string, dto: ParkCallDto) {
    const meta = this.telecomMeta(dto.platformUuid);
    const result = await this.park.park({
      platformUuid: dto.platformUuid,
      slot: dto.slot,
      parkedByLineId: dto.operatorLineId,
      meta,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.reception.park',
      entityType: 'CallSession',
      entityId: dto.platformUuid,
      metadata: { platformUuid: dto.platformUuid, slot: dto.slot },
    });
    this.events.publish(tenantId, 'park', { platformUuid: dto.platformUuid, action: 'park' });
    return result;
  }

  async retrieveParked(tenantId: string, userId: string, dto: RetrieveParkedCallDto) {
    const meta = this.telecomMeta(`retrieve-${dto.slot}`);
    const result = await this.park.retrieve({
      tenantId,
      slot: dto.slot,
      retrieverLineId: dto.operatorLineId,
      meta,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.reception.retrieve',
      entityType: 'CallSession',
      entityId: dto.slot,
      metadata: { slot: dto.slot },
    });
    return result;
  }

  async directedPickup(tenantId: string, userId: string, dto: PickupCallDto) {
    if (!dto.targetExtension) throw new NotFoundException('targetExtension required');
    const meta = this.telecomMeta(`pickup-${dto.targetExtension}`);
    const result = await this.pickup.directedPickup({
      tenantId,
      targetExt: dto.targetExtension,
      pickerLineId: dto.operatorLineId,
      meta,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.reception.pickup.directed',
      entityType: 'CallSession',
      entityId: dto.targetExtension,
      metadata: { targetExtension: dto.targetExtension },
    });
    return result;
  }

  async groupPickup(tenantId: string, userId: string, dto: PickupCallDto) {
    const meta = this.telecomMeta(`group-pickup-${dto.groupId ?? 'default'}`);
    const result = await this.pickup.groupPickup({
      tenantId,
      groupId: dto.groupId,
      pickerLineId: dto.operatorLineId,
      meta,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.reception.pickup.group',
      entityType: 'CallSession',
      entityId: dto.groupId ?? 'default',
      metadata: { groupId: dto.groupId },
    });
    return result;
  }

  async queuePickup(tenantId: string, userId: string, dto: PickupCallDto) {
    if (!dto.queueId) throw new NotFoundException('queueId required');
    const ringing = await this.prisma.callSession.findFirst({
      where: {
        tenantId,
        queueId: dto.queueId,
        deletedAt: null,
        state: CallLifecycleState.RINGING,
      },
      orderBy: { startedAt: 'asc' },
    });
    if (!ringing?.toLineId) throw new NotFoundException('No ringing queue call');
    const ext = await this.prisma.extension.findFirst({ where: { lineId: ringing.toLineId } });
    if (!ext) throw new NotFoundException('Extension not found');
    return this.directedPickup(tenantId, userId, {
      targetExtension: ext.extension,
      operatorLineId: dto.operatorLineId,
    });
  }

  async holdCall(tenantId: string, userId: string, dto: ReceptionHoldDto) {
    await this.updateRuntime(tenantId, dto.platformUuid, { onHold: dto.hold !== false });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: dto.hold !== false ? 'pbx.reception.hold' : 'pbx.reception.resume',
      entityType: 'CallSession',
      entityId: dto.platformUuid,
      metadata: { platformUuid: dto.platformUuid },
    });
    this.events.publish(tenantId, 'call', { platformUuid: dto.platformUuid, onHold: dto.hold !== false });
    return { ok: true };
  }

  async muteCall(tenantId: string, userId: string, dto: ReceptionMuteDto) {
    await this.updateRuntime(tenantId, dto.platformUuid, { muted: dto.muted !== false });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: dto.muted !== false ? 'pbx.reception.mute' : 'pbx.reception.unmute',
      entityType: 'CallSession',
      entityId: dto.platformUuid,
      metadata: { platformUuid: dto.platformUuid },
    });
    return { ok: true };
  }

  async transferCall(tenantId: string, userId: string, dto: ReceptionTransferDto) {
    await this.updateRuntime(tenantId, dto.platformUuid, {
      transferPending: true,
      transferTarget: dto.target,
      warmTransfer: dto.warm ?? false,
      transferBy: userId,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: dto.warm ? 'pbx.reception.transfer.warm' : 'pbx.reception.transfer.blind',
      entityType: 'CallSession',
      entityId: dto.platformUuid,
      metadata: { platformUuid: dto.platformUuid, target: dto.target },
    });
    this.events.publish(tenantId, 'transfer', { platformUuid: dto.platformUuid, target: dto.target, warm: dto.warm });
    return { ok: true, target: dto.target };
  }

  async hangupCall(tenantId: string, userId: string, dto: ReceptionCallActionDto) {
    const session = await this.prisma.callSession.findFirst({
      where: { tenantId, platformUuid: dto.platformUuid, deletedAt: null },
    });
    if (!session) throw new NotFoundException('Call not found');
    await this.prisma.callSession.update({
      where: { id: session.id },
      data: { state: CallLifecycleState.ENDED, endedAt: new Date() },
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.reception.hangup',
      entityType: 'CallSession',
      entityId: session.id,
      metadata: { platformUuid: dto.platformUuid },
    });
    this.events.publish(tenantId, 'call', { platformUuid: dto.platformUuid, state: 'ended' });
    return { ok: true };
  }

  async setOperatorPresence(tenantId: string, userId: string, dto: SetOperatorPresenceDto) {
    await this.presence.setAdminOverride({
      tenantId,
      lineId: dto.lineId,
      status: dto.status,
      customMessage: dto.customMessage,
      userId,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.reception.presence.set',
      entityType: 'Presence',
      entityId: dto.lineId,
      metadata: { status: dto.status },
    });
    return { ok: true, lineId: dto.lineId, status: dto.status };
  }

  async getReports(tenantId: string, days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    if (!this.prisma.connected) {
      return { transfers: 0, pickups: 0, parked: 0, missed: 0, avgResponseSec: 0 };
    }

    const [transfers, pickups, parked, missed] = await Promise.all([
      this.prisma.auditLog.count({
        where: {
          tenantId,
          action: { in: ['pbx.reception.transfer.blind', 'pbx.reception.transfer.warm', 'supervisor.call.transfer'] },
          createdAt: { gte: since },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          tenantId,
          action: { startsWith: 'pbx.reception.pickup' },
          createdAt: { gte: since },
        },
      }),
      this.prisma.auditLog.count({
        where: { tenantId, action: 'pbx.reception.park', createdAt: { gte: since } },
      }),
      this.prisma.callSession.count({
        where: {
          tenantId,
          deletedAt: null,
          state: CallLifecycleState.ENDED,
          answeredAt: null,
          startedAt: { gte: since },
        },
      }),
    ]);

    return { transfers, pickups, parked, missed, avgResponseSec: 0, days };
  }

  private telecomMeta(platformUuid: string) {
    const id = randomUUID();
    return { requestId: id, correlationId: id, platformUuid, idempotencyKey: id };
  }

  private async updateRuntime(tenantId: string, platformUuid: string, patch: Record<string, unknown>) {
    const key = this.redis.callRuntimeKey(tenantId, platformUuid);
    const raw = await this.redis.get(key);
    let current: Record<string, unknown> = {};
    if (raw) {
      try {
        current = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        current = {};
      }
    }
    await this.redis.setex(key, 3600, JSON.stringify({ ...current, ...patch }));
  }
}
