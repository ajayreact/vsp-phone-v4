import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VoicemailGreetingType, VoicemailStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { ObjectStorageService } from '../../recording/storage/object-storage.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  BulkVoicemailMessageIdsDto,
  CreateVoicemailDto,
  SearchVoicemailMessagesDto,
  UpdateVoicemailDto,
  UpdateVoicemailMessageDto,
  UpsertVoicemailGreetingDto,
} from '../dto/tenant-voicemail.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { newPublicId, tenantScope } from '../utils/tenant.util';

const voicemailInclude = {
  line: { select: { id: true, name: true } },
  greetings: true,
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 5,
  },
  _count: { select: { messages: { where: { deletedAt: null, readAt: null } } } },
} satisfies Prisma.VoicemailInclude;

@Injectable()
export class TenantVoicemailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
    private readonly storage: ObjectStorageService,
  ) {}

  async list(tenantId: string, search?: string) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { mailboxNumber: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.voicemail.findMany({
      where,
      include: voicemailInclude,
      orderBy: { name: 'asc' },
      take: 500,
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.voicemail.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: voicemailInclude,
    });
    if (!row) throw new NotFoundException('Voicemail not found');
    return row;
  }

  async create(tenantId: string, userId: string, dto: CreateVoicemailDto) {
    if (dto.lineId) {
      const line = await this.prisma.line.findFirst({ where: { id: dto.lineId, tenantId, deletedAt: null } });
      if (!line) throw new NotFoundException('Line not found');
    }

    const vm = await this.prisma.voicemail.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('vm'),
        tenantId,
        lineId: dto.lineId,
        name: dto.name,
        mailboxType: dto.mailboxType ?? 'PERSONAL',
        mailboxNumber: dto.mailboxNumber,
        queueId: dto.queueId,
        ringGroupId: dto.ringGroupId,
        conferenceId: dto.conferenceId,
        pin: dto.pin,
        status: dto.status ?? VoicemailStatus.ACTIVE,
        language: dto.language ?? 'en',
        timezone: dto.timezone,
        emailNotify: dto.emailNotify,
        emailAttach: dto.emailAttach ?? true,
        emailDeleteAfter: dto.emailDeleteAfter ?? false,
        transcriptionReady: dto.transcriptionReady ?? false,
        storageQuotaMb: dto.storageQuotaMb,
        retentionDays: dto.retentionDays,
        createdBy: userId,
      },
      include: voicemailInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.voicemail.create',
      entityType: 'Voicemail',
      entityId: vm.id,
      metadata: { name: dto.name, mailboxType: vm.mailboxType },
    });

    return vm;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateVoicemailDto) {
    await this.require(tenantId, id);

    const vm = await this.prisma.voicemail.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.mailboxType !== undefined ? { mailboxType: dto.mailboxType } : {}),
        ...(dto.mailboxNumber !== undefined ? { mailboxNumber: dto.mailboxNumber } : {}),
        ...(dto.pin !== undefined ? { pin: dto.pin } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.language !== undefined ? { language: dto.language } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.emailNotify !== undefined ? { emailNotify: dto.emailNotify } : {}),
        ...(dto.emailAttach !== undefined ? { emailAttach: dto.emailAttach } : {}),
        ...(dto.emailDeleteAfter !== undefined ? { emailDeleteAfter: dto.emailDeleteAfter } : {}),
        ...(dto.transcriptionReady !== undefined ? { transcriptionReady: dto.transcriptionReady } : {}),
        ...(dto.storageQuotaMb !== undefined ? { storageQuotaMb: dto.storageQuotaMb } : {}),
        ...(dto.retentionDays !== undefined ? { retentionDays: dto.retentionDays } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: voicemailInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.voicemail.update',
      entityType: 'Voicemail',
      entityId: vm.id,
    });

    return vm;
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.require(tenantId, id);
    const vm = await this.prisma.voicemail.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.voicemail.delete',
      entityType: 'Voicemail',
      entityId: vm.id,
    });

    return vm;
  }

  async listMessages(tenantId: string, voicemailId: string, params: SearchVoicemailMessagesDto) {
    await this.require(tenantId, voicemailId);

    const where: Record<string, unknown> = {
      tenantId,
      voicemailId,
      deletedAt: null,
    };
    if (params.unreadOnly) where.readAt = null;
    if (params.flaggedOnly) where.flagged = true;
    if (params.search?.trim()) {
      where.OR = [
        { callerId: { contains: params.search.trim(), mode: 'insensitive' } },
        { callerName: { contains: params.search.trim(), mode: 'insensitive' } },
        { notes: { contains: params.search.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.voicemailMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async updateMessage(tenantId: string, userId: string, messageId: string, dto: UpdateVoicemailMessageDto) {
    const msg = await this.prisma.voicemailMessage.findFirst({
      where: { id: messageId, tenantId, deletedAt: null },
    });
    if (!msg) throw new NotFoundException('Voicemail message not found');

    const updated = await this.prisma.voicemailMessage.update({
      where: { id: messageId },
      data: {
        ...(dto.read === true ? { readAt: new Date() } : dto.read === false ? { readAt: null } : {}),
        ...(dto.flagged !== undefined ? { flagged: dto.flagged } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.voicemail.message.update',
      entityType: 'VoicemailMessage',
      entityId: messageId,
    });

    return updated;
  }

  async deleteMessage(tenantId: string, userId: string, messageId: string) {
    const msg = await this.prisma.voicemailMessage.findFirst({
      where: { id: messageId, tenantId, deletedAt: null },
    });
    if (!msg) throw new NotFoundException('Voicemail message not found');

    const updated = await this.prisma.voicemailMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.voicemail.message.delete',
      entityType: 'VoicemailMessage',
      entityId: messageId,
    });

    return updated;
  }

  async restoreMessage(tenantId: string, userId: string, messageId: string) {
    const msg = await this.prisma.voicemailMessage.findFirst({
      where: { id: messageId, tenantId, deletedAt: { not: null } },
    });
    if (!msg) throw new NotFoundException('Deleted message not found');

    const updated = await this.prisma.voicemailMessage.update({
      where: { id: messageId },
      data: { deletedAt: null },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.voicemail.message.restore',
      entityType: 'VoicemailMessage',
      entityId: messageId,
    });

    return updated;
  }

  async bulkDeleteMessages(tenantId: string, userId: string, dto: BulkVoicemailMessageIdsDto) {
    await this.prisma.voicemailMessage.updateMany({
      where: { tenantId, id: { in: dto.ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.voicemail.message.bulk_delete',
      entityType: 'VoicemailMessage',
      entityId: tenantId,
      metadata: { count: dto.ids.length },
    });

    return { deleted: dto.ids.length };
  }

  async bulkMarkRead(tenantId: string, userId: string, dto: BulkVoicemailMessageIdsDto, read: boolean) {
    await this.prisma.voicemailMessage.updateMany({
      where: { tenantId, id: { in: dto.ids }, deletedAt: null },
      data: { readAt: read ? new Date() : null },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: read ? 'pbx.voicemail.message.bulk_read' : 'pbx.voicemail.message.bulk_unread',
      entityType: 'VoicemailMessage',
      entityId: tenantId,
      metadata: { count: dto.ids.length },
    });

    return { updated: dto.ids.length };
  }

  async getMessagePlaybackUrl(tenantId: string, messageId: string) {
    const msg = await this.prisma.voicemailMessage.findFirst({
      where: { id: messageId, tenantId, deletedAt: null },
    });
    if (!msg?.mediaObjectKey) throw new NotFoundException('Message media not available');
    const url = await this.storage.signedUrl(msg.mediaObjectKey);
    if (!url) throw new NotFoundException('Playback URL unavailable');
    return { url, messageId };
  }

  async upsertGreeting(tenantId: string, userId: string, voicemailId: string, dto: UpsertVoicemailGreetingDto) {
    await this.require(tenantId, voicemailId);

    const greeting = await this.prisma.voicemailGreeting.upsert({
      where: {
        voicemailId_greetingType: { voicemailId, greetingType: dto.greetingType },
      },
      create: {
        id: randomUUID(),
        tenantId,
        voicemailId,
        greetingType: dto.greetingType,
        mediaObjectKey: dto.mediaObjectKey,
        ttsText: dto.ttsText,
      },
      update: {
        mediaObjectKey: dto.mediaObjectKey,
        ttsText: dto.ttsText,
        version: { increment: 1 },
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.voicemail.greeting.upsert',
      entityType: 'VoicemailGreeting',
      entityId: greeting.id,
      metadata: { greetingType: dto.greetingType },
    });

    return greeting;
  }

  async getReports(tenantId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000);

    const [mailboxes, messages, unread, storageUsed] = await Promise.all([
      this.prisma.voicemail.count({ where: { ...tenantScope(tenantId) } }),
      this.prisma.voicemailMessage.count({ where: { tenantId, createdAt: { gte: since }, deletedAt: null } }),
      this.prisma.voicemailMessage.count({ where: { tenantId, readAt: null, deletedAt: null } }),
      this.prisma.voicemailMessage.aggregate({
        where: { tenantId, deletedAt: null },
        _sum: { durationSec: true },
      }),
    ]);

    return {
      periodDays: days,
      mailboxes,
      messagesReceived: messages,
      unreadMessages: unread,
      totalDurationSec: storageUsed._sum.durationSec ?? 0,
    };
  }

  private async require(tenantId: string, id: string) {
    const row = await this.prisma.voicemail.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Voicemail not found');
    return row;
  }
}
