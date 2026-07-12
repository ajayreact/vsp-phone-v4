import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LineStatus, PresenceStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type { CreateLineDto, LineTelephonySettingsDto, UpdateLineDto } from '../dto/tenant-lines.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { newPublicId, tenantScope } from '../utils/tenant.util';

const lineInclude = {
  user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true, displayName: true } } } },
  extension: true,
  presence: true,
  callerId: { include: { phoneNumber: { select: { id: true, number: true } } } },
  telephonySettings: true,
  voicemail: { select: { id: true, status: true, pin: true } },
  callPolicy: true,
  recordingPolicy: true,
} as const;

@Injectable()
export class TenantLinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string, search?: string) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }

    return this.prisma.line.findMany({
      where,
      include: lineInclude,
      orderBy: { name: 'asc' },
      take: 500,
    });
  }

  async getById(tenantId: string, id: string) {
    const line = await this.prisma.line.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: lineInclude,
    });
    if (!line) throw new NotFoundException('Line not found');
    return line;
  }

  async create(tenantId: string, actorUserId: string, dto: CreateLineDto) {
    if (dto.userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: dto.userId, tenantId, deletedAt: null },
      });
      if (!user) throw new NotFoundException('User not found');
    }

    const lineId = randomUUID();
    const line = await this.prisma.line.create({
      data: {
        id: lineId,
        publicId: newPublicId('line'),
        tenantId,
        userId: dto.userId ?? null,
        name: dto.name,
        status: LineStatus.ACTIVE,
        createdBy: actorUserId,
        presence: {
          create: {
            id: randomUUID(),
            tenantId,
            status: PresenceStatus.OFFLINE,
            createdBy: actorUserId,
          },
        },
        callerId: {
          create: {
            id: randomUUID(),
            tenantId,
            callerIdName: dto.callerIdName,
            emergencyCallerIdName: dto.emergencyCallerIdName,
            phoneNumberId: dto.phoneNumberId,
            createdBy: actorUserId,
          },
        },
        callPolicy: {
          create: {
            id: randomUUID(),
            tenantId,
            inboundEnabled: true,
            outboundEnabled: true,
            createdBy: actorUserId,
          },
        },
        recordingPolicy: {
          create: {
            id: randomUUID(),
            tenantId,
            recordingEnabled: false,
            recordInbound: false,
            recordOutbound: false,
            createdBy: actorUserId,
          },
        },
        telephonySettings: dto.settings
          ? { create: this.settingsCreate(tenantId, actorUserId, dto.settings) }
          : {
              create: {
                id: randomUUID(),
                tenantId,
                createdBy: actorUserId,
              },
            },
      },
      include: lineInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId,
      action: 'pbx.line.create',
      entityType: 'Line',
      entityId: line.id,
      metadata: { name: line.name, userId: dto.userId ?? null },
    });

    return line;
  }

  async update(tenantId: string, actorUserId: string, id: string, dto: UpdateLineDto) {
    await this.require(tenantId, id);

    if (dto.name) {
      await this.prisma.line.update({
        where: { id },
        data: { name: dto.name, updatedBy: actorUserId, version: { increment: 1 } },
      });
    }

    if (dto.callerIdName !== undefined || dto.phoneNumberId !== undefined || dto.emergencyCallerIdName !== undefined) {
      const existing = await this.prisma.callerID.findFirst({ where: { lineId: id, tenantId } });
      if (existing) {
        await this.prisma.callerID.update({
          where: { id: existing.id },
          data: {
            ...(dto.callerIdName !== undefined ? { callerIdName: dto.callerIdName } : {}),
            ...(dto.phoneNumberId !== undefined ? { phoneNumberId: dto.phoneNumberId } : {}),
            ...(dto.emergencyCallerIdName !== undefined ? { emergencyCallerIdName: dto.emergencyCallerIdName } : {}),
            updatedBy: actorUserId,
            version: { increment: 1 },
          },
        });
      }
    }

    if (dto.settings) {
      await this.upsertSettings(tenantId, actorUserId, id, dto.settings);
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId,
      action: 'pbx.line.update',
      entityType: 'Line',
      entityId: id,
    });

    return this.getById(tenantId, id);
  }

  async remove(tenantId: string, actorUserId: string, id: string) {
    await this.require(tenantId, id);
    await this.prisma.line.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorUserId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId,
      action: 'pbx.line.delete',
      entityType: 'Line',
      entityId: id,
    });

    return { ok: true };
  }

  private settingsCreate(tenantId: string, actorUserId: string, dto: LineTelephonySettingsDto): Prisma.LineTelephonySettingsUncheckedCreateWithoutLineInput {
    return {
      id: randomUUID(),
      tenantId,
      createdBy: actorUserId,
      ...this.settingsPatch(dto),
    } as Prisma.LineTelephonySettingsUncheckedCreateWithoutLineInput;
  }

  private settingsPatch(dto: LineTelephonySettingsDto): Prisma.LineTelephonySettingsUpdateInput {
    return {
      ...(dto.pin !== undefined ? { pin: dto.pin } : {}),
      ...(dto.callForwardEnabled !== undefined ? { callForwardEnabled: dto.callForwardEnabled } : {}),
      ...(dto.callForwardType !== undefined ? { callForwardType: dto.callForwardType } : {}),
      ...(dto.callForwardDestination !== undefined ? { callForwardDestination: dto.callForwardDestination } : {}),
      ...(dto.followMeEnabled !== undefined ? { followMeEnabled: dto.followMeEnabled } : {}),
      ...(dto.followMeDestinations !== undefined
        ? { followMeDestinations: dto.followMeDestinations as Prisma.InputJsonValue }
        : {}),
      ...(dto.findMeEnabled !== undefined ? { findMeEnabled: dto.findMeEnabled } : {}),
      ...(dto.findMeDestinations !== undefined
        ? { findMeDestinations: dto.findMeDestinations as Prisma.InputJsonValue }
        : {}),
      ...(dto.dndEnabled !== undefined ? { dndEnabled: dto.dndEnabled } : {}),
      ...(dto.voicemailNotifyEmail !== undefined ? { voicemailNotifyEmail: dto.voicemailNotifyEmail } : {}),
    };
  }

  private async upsertSettings(tenantId: string, actorUserId: string, lineId: string, dto: LineTelephonySettingsDto) {
    const existing = await this.prisma.lineTelephonySettings.findFirst({ where: { lineId, tenantId } });
    if (existing) {
      await this.prisma.lineTelephonySettings.update({
        where: { id: existing.id },
        data: { ...this.settingsPatch(dto), updatedBy: actorUserId, version: { increment: 1 } },
      });
      return;
    }
    await this.prisma.lineTelephonySettings.create({
      data: {
        id: randomUUID(),
        tenantId,
        lineId,
        createdBy: actorUserId,
        ...this.settingsPatch(dto),
      } as Prisma.LineTelephonySettingsUncheckedCreateInput,
    });
  }

  private async require(tenantId: string, id: string) {
    const row = await this.prisma.line.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Line not found');
    return row;
  }
}

export type { CreateLineDto, UpdateLineDto };
