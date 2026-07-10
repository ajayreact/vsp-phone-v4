import { Injectable, NotFoundException } from '@nestjs/common';
import { BlfKeyFunction, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { BlfSubscriptionService } from '../../enterprise-ops/runtime/blf-subscription.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import type { CreateBlfPanelDto, ReorderBlfKeysDto, UpdateBlfPanelDto } from '../dto/tenant-blf.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { newPublicId, tenantScope } from '../utils/tenant.util';

const panelInclude = {
  keys: {
    orderBy: { position: 'asc' as const },
    include: { watchedLine: { include: { extension: true, presence: true, user: { include: { profile: true } } } } },
  },
  line: { select: { id: true, name: true } },
  user: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
} satisfies Prisma.BlfPanelInclude;

export type BlfLampDetail = {
  lineId: string;
  lampState: string;
  presence: string | null;
  ringing: boolean;
  forwarded: boolean;
  dnd: boolean;
  voicemail: boolean;
  parked: boolean;
  pickupAvailable: boolean;
  displayName: string | null;
  extension: string | null;
};

@Injectable()
export class TenantBlfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blf: BlfSubscriptionService,
    private readonly redis: TelecomRedisService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async listPanels(tenantId: string, userId?: string) {
    if (!this.prisma.connected) return [];
    const where: Prisma.BlfPanelWhereInput = tenantScope(tenantId);
    if (userId) where.OR = [{ userId }, { userId: null }];
    return this.prisma.blfPanel.findMany({
      where,
      include: panelInclude,
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  async getPanel(tenantId: string, id: string) {
    const row = await this.prisma.blfPanel.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: panelInclude,
    });
    if (!row) throw new NotFoundException('BLF panel not found');
    return row;
  }

  async createPanel(tenantId: string, userId: string, dto: CreateBlfPanelDto) {
    const panel = await this.prisma.blfPanel.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('blf'),
        tenantId,
        name: dto.name,
        columns: dto.columns ?? 4,
        userId: dto.userId ?? userId,
        lineId: dto.lineId,
        createdBy: userId,
        keys: dto.keys?.length
          ? {
              create: dto.keys.map((k) => ({
                id: randomUUID(),
                position: k.position,
                label: k.label,
                functionType: k.functionType ?? BlfKeyFunction.BLF,
                watchedLineId: k.watchedLineId,
                speedDialValue: k.speedDialValue,
              })),
            }
          : undefined,
      },
      include: panelInclude,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.blf_panel.create',
      entityType: 'BlfPanel',
      entityId: panel.id,
      metadata: { publicId: panel.publicId },
    });
    return panel;
  }

  async updatePanel(tenantId: string, userId: string, id: string, dto: UpdateBlfPanelDto) {
    await this.getPanel(tenantId, id);
    if (dto.keys) {
      await this.prisma.blfPanelKey.deleteMany({ where: { panelId: id } });
      await this.prisma.blfPanelKey.createMany({
        data: dto.keys.map((k) => ({
          id: randomUUID(),
          panelId: id,
          position: k.position,
          label: k.label,
          functionType: k.functionType ?? BlfKeyFunction.BLF,
          watchedLineId: k.watchedLineId,
          speedDialValue: k.speedDialValue,
        })),
      });
    }
    const panel = await this.prisma.blfPanel.update({
      where: { id },
      data: {
        name: dto.name,
        columns: dto.columns,
        updatedBy: userId,
      },
      include: panelInclude,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.blf_panel.update',
      entityType: 'BlfPanel',
      entityId: id,
      metadata: { publicId: panel.publicId },
    });
    return panel;
  }

  async reorderKeys(tenantId: string, userId: string, panelId: string, dto: ReorderBlfKeysDto) {
    await this.getPanel(tenantId, panelId);
    await this.prisma.blfPanelKey.deleteMany({ where: { panelId } });
    await this.prisma.blfPanelKey.createMany({
      data: dto.keys.map((k) => ({
        id: randomUUID(),
        panelId,
        position: k.position,
        label: k.label,
        functionType: k.functionType ?? BlfKeyFunction.BLF,
        watchedLineId: k.watchedLineId,
        speedDialValue: k.speedDialValue,
      })),
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.blf_panel.reorder',
      entityType: 'BlfPanel',
      entityId: panelId,
    });
    return this.getPanel(tenantId, panelId);
  }

  async removePanel(tenantId: string, userId: string, id: string) {
    const row = await this.getPanel(tenantId, id);
    await this.prisma.blfPanel.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.blf_panel.delete',
      entityType: 'BlfPanel',
      entityId: id,
      metadata: { publicId: row.publicId },
    });
    return { ok: true };
  }

  async getLampsForPanel(tenantId: string, panelId: string): Promise<BlfLampDetail[]> {
    const panel = await this.getPanel(tenantId, panelId);
    const lineIds = panel.keys
      .map((k) => k.watchedLineId)
      .filter((id): id is string => Boolean(id));
    const unique = [...new Set(lineIds)];
    const lamps = await Promise.all(unique.map((lineId) => this.getLampDetail(tenantId, lineId)));
    return lamps;
  }

  async getLampDetail(tenantId: string, lineId: string): Promise<BlfLampDetail> {
    const line = await this.prisma.line.findFirst({
      where: { id: lineId, tenantId, deletedAt: null },
      include: {
        extension: true,
        presence: true,
        telephonySettings: true,
        user: { include: { profile: true } },
        voicemail: { select: { _count: { select: { messages: { where: { deletedAt: null, readAt: null } } } } } },
      },
    });
    if (!line) throw new NotFoundException('Line not found');

    const ringing = Boolean(await this.redis.get(this.redis.pickupRingingKey(tenantId, lineId)));
    const lampState = await this.blf.lampStateForLine(tenantId, lineId);
    const parked = await this.isLineParked(tenantId, lineId);

    return {
      lineId,
      lampState,
      presence: line.presence?.status ?? null,
      ringing,
      forwarded: line.telephonySettings?.callForwardEnabled ?? false,
      dnd: line.telephonySettings?.dndEnabled ?? false,
      voicemail: (line.voicemail?._count?.messages ?? 0) > 0,
      parked,
      pickupAvailable: ringing,
      displayName: line.user?.profile?.displayName ?? line.name,
      extension: line.extension?.extension ?? null,
    };
  }

  private async isLineParked(tenantId: string, lineId: string): Promise<boolean> {
    const lots = await this.prisma.parkingLot.findMany({ where: { tenantId, deletedAt: null } });
    for (const lot of lots.length ? lots : [{ slotStart: 1, slotCount: 20 }]) {
      for (let i = lot.slotStart; i < lot.slotStart + lot.slotCount; i++) {
        const slot = String(i).padStart(2, '0');
        const raw = await this.redis.get(this.redis.parkSlotKey(tenantId, slot));
        if (!raw) continue;
        try {
          const data = JSON.parse(raw) as { parkedByLineId?: string };
          if (data.parkedByLineId === lineId) return true;
        } catch {
          /* ignore */
        }
      }
    }
    return false;
  }
}
