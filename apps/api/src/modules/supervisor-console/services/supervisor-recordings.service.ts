import { Injectable, NotFoundException } from '@nestjs/common';
import { RecordingAnnotationType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { RecordingLifecycleService } from '../../recording/lifecycle/recording-lifecycle.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';

@Injectable()
export class SupervisorRecordingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: RecordingLifecycleService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async search(tenantId: string, params: { search?: string; from?: string; to?: string; limit?: number }) {
    const limit = Math.min(params.limit ?? 100, 500);
    const where: Record<string, unknown> = { tenantId, deletedAt: null };

    if (params.from || params.to) {
      where.createdAt = {
        ...(params.from ? { gte: new Date(params.from) } : {}),
        ...(params.to ? { lte: new Date(params.to) } : {}),
      };
    }

    const rows = await this.prisma.recording.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        callSession: { select: { platformUuid: true, callType: true } },
      },
    });

    let filtered = rows;
    if (params.search?.trim()) {
      const q = params.search.trim().toLowerCase();
      filtered = rows.filter(
        (r) =>
          r.publicId.toLowerCase().includes(q) ||
          r.callSession?.platformUuid.toLowerCase().includes(q),
      );
    }

    const annotations = await this.prisma.recordingAnnotation.findMany({
      where: { tenantId, recordingId: { in: filtered.map((r) => r.id) } },
    });
    const annByRecording = new Map<string, typeof annotations>();
    for (const a of annotations) {
      const list = annByRecording.get(a.recordingId) ?? [];
      list.push(a);
      annByRecording.set(a.recordingId, list);
    }

    return filtered.map((r) => ({
      id: r.id,
      publicId: r.publicId,
      callSessionId: r.callSessionId,
      platformUuid: r.callSession?.platformUuid ?? null,
      status: r.status,
      durationSeconds: r.durationSeconds,
      startedAt: r.startedAt?.toISOString() ?? null,
      endedAt: r.endedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      annotations: (annByRecording.get(r.id) ?? []).map((a) => ({
        id: a.id,
        type: a.type,
        body: a.body,
        userId: a.userId,
        createdAt: a.createdAt.toISOString(),
      })),
    }));
  }

  async getPlaybackUrl(tenantId: string, recordingId: string) {
    const url = await this.lifecycle.getSignedUrl(tenantId, recordingId);
    if (!url) throw new NotFoundException('Recording media not available');
    return { url };
  }

  async addAnnotation(
    tenantId: string,
    userId: string,
    recordingId: string,
    type: 'FLAG' | 'COMMENT' | 'BOOKMARK',
    body?: string,
  ) {
    const recording = await this.prisma.recording.findFirst({
      where: { id: recordingId, tenantId, deletedAt: null },
    });
    if (!recording) throw new NotFoundException('Recording not found');

    const row = await this.prisma.recordingAnnotation.create({
      data: {
        id: randomUUID(),
        tenantId,
        recordingId,
        userId,
        type: type as RecordingAnnotationType,
        body,
      },
    });

    await this.audit.append({
      tenantId,
      actorUserId: userId,
      actorType: 'supervisor',
      action: `supervisor.recording.${type.toLowerCase()}`,
      resourceType: 'recording',
      resourceId: recordingId,
      detail: { body },
    });

    return row;
  }

  async addCoachingNote(
    tenantId: string,
    supervisorUserId: string,
    payload: {
      callSessionId: string;
      agentLineId?: string;
      qualityScore?: number;
      agentScore?: number;
      notes?: string;
      whisperUsed?: boolean;
    },
  ) {
    const session = await this.prisma.callSession.findFirst({
      where: { id: payload.callSessionId, tenantId, deletedAt: null },
    });
    if (!session) throw new NotFoundException('Call session not found');

    const row = await this.prisma.coachingNote.create({
      data: {
        id: randomUUID(),
        tenantId,
        callSessionId: payload.callSessionId,
        agentLineId: payload.agentLineId,
        supervisorUserId,
        qualityScore: payload.qualityScore,
        agentScore: payload.agentScore,
        notes: payload.notes,
        whisperUsed: payload.whisperUsed ?? false,
      },
    });

    await this.audit.append({
      tenantId,
      actorUserId: supervisorUserId,
      actorType: 'supervisor',
      action: 'supervisor.coaching.note',
      resourceType: 'call_session',
      resourceId: payload.callSessionId,
      detail: { qualityScore: payload.qualityScore, agentScore: payload.agentScore },
    });

    return row;
  }

  async listCoachingNotes(tenantId: string, callSessionId?: string) {
    return this.prisma.coachingNote.findMany({
      where: {
        tenantId,
        ...(callSessionId ? { callSessionId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
