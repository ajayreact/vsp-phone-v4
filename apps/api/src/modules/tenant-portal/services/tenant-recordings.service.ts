import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RecordingAnnotationType, RecordingPolicyMode, RecordingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { RecordingLifecycleService } from '../../recording/lifecycle/recording-lifecycle.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  BulkRecordingIdsDto,
  RecordingAnnotationDto,
  SearchRecordingsDto,
  UpdateRecordingDto,
} from '../dto/tenant-recordings.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { tenantScope } from '../utils/tenant.util';

@Injectable()
export class TenantRecordingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: RecordingLifecycleService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async search(tenantId: string, params: SearchRecordingsDto) {
    if (!this.prisma.connected) return [];

    const limit = Math.min(params.limit ?? 100, 500);
    const where: Record<string, unknown> = { ...tenantScope(tenantId), status: RecordingStatus.COMPLETED };

    if (params.from || params.to) {
      where.createdAt = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }
    if (params.lineId) where.lineId = params.lineId;
    if (params.queueId) where.queueId = params.queueId;
    if (params.ivrId) where.ivrId = params.ivrId;
    if (params.category) where.category = params.category;
    if (params.bookmarkedOnly) where.bookmarked = true;
    if (params.legalHoldOnly) where.legalHold = true;

    const rows = await this.prisma.recording.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        callSession: { select: { platformUuid: true, callType: true } },
        transcript: { select: { status: true, language: true } },
      },
    });

    if (!params.search?.trim()) return rows;

    const q = params.search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.publicId.toLowerCase().includes(q) ||
        (r.callerNumber?.toLowerCase().includes(q) ?? false) ||
        (r.calleeNumber?.toLowerCase().includes(q) ?? false) ||
        (r.notes?.toLowerCase().includes(q) ?? false) ||
        r.callSession?.platformUuid.toLowerCase().includes(q),
    );
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.recording.findFirst({
      where: { id, ...tenantScope(tenantId), deletedAt: null },
      include: {
        callSession: { select: { platformUuid: true, callType: true, queueId: true, ivrId: true } },
        transcript: true,
      },
    });
    if (!row) throw new NotFoundException('Recording not found');
    return row;
  }

  async getPlaybackUrl(tenantId: string, id: string) {
    const url = await this.lifecycle.getSignedUrl(tenantId, id);
    if (!url) throw new NotFoundException('Recording media not available');
    return { url, recordingId: id };
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateRecordingDto) {
    await this.getById(tenantId, id);

    const recording = await this.prisma.recording.update({
      where: { id },
      data: {
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags as Prisma.InputJsonValue } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.bookmarked !== undefined ? { bookmarked: dto.bookmarked } : {}),
        ...(dto.legalHold !== undefined ? { legalHold: dto.legalHold } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.recording.update',
      entityType: 'Recording',
      entityId: id,
    });

    return recording;
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.getById(tenantId, id);
    const recording = await this.prisma.recording.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId, status: RecordingStatus.DELETED },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.recording.delete',
      entityType: 'Recording',
      entityId: id,
    });

    return recording;
  }

  async bulkDelete(tenantId: string, userId: string, dto: BulkRecordingIdsDto) {
    await this.prisma.recording.updateMany({
      where: { tenantId, id: { in: dto.ids }, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId, status: RecordingStatus.DELETED },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.recording.bulk_delete',
      entityType: 'Recording',
      entityId: tenantId,
      metadata: { count: dto.ids.length },
    });

    return { deleted: dto.ids.length };
  }

  async addAnnotation(tenantId: string, userId: string, recordingId: string, dto: RecordingAnnotationDto) {
    await this.getById(tenantId, recordingId);

    const row = await this.prisma.recordingAnnotation.create({
      data: {
        id: randomUUID(),
        tenantId,
        recordingId,
        userId,
        type: dto.type as RecordingAnnotationType,
        body: dto.body,
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: `pbx.recording.annotate.${dto.type.toLowerCase()}`,
      entityType: 'Recording',
      entityId: recordingId,
    });

    return row;
  }

  async getTranscript(tenantId: string, recordingId: string) {
    await this.getById(tenantId, recordingId);
    const transcript = await this.prisma.recordingTranscript.findFirst({
      where: { tenantId, recordingId },
    });
    if (!transcript) throw new NotFoundException('Transcript not found');
    return transcript;
  }

  async getReports(tenantId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000);

    const [total, legalHold, bookmarked, totalDuration] = await Promise.all([
      this.prisma.recording.count({ where: { tenantId, createdAt: { gte: since }, deletedAt: null } }),
      this.prisma.recording.count({ where: { tenantId, legalHold: true, deletedAt: null } }),
      this.prisma.recording.count({ where: { tenantId, bookmarked: true, deletedAt: null } }),
      this.prisma.recording.aggregate({
        where: { tenantId, createdAt: { gte: since }, deletedAt: null },
        _sum: { durationSeconds: true },
      }),
    ]);

    return {
      periodDays: days,
      recordings: total,
      legalHold,
      bookmarked,
      totalDurationSec: totalDuration._sum.durationSeconds ?? 0,
    };
  }
}
