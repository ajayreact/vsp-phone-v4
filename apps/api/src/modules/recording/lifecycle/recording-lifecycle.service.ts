import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '@nestjs/event-emitter';
import { RecordingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CALL_EVENTS, type CallLifecyclePayload } from '../../telecom/events/call.events';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import type { TelecomCallMeta } from '../../telecom/telecom.service.interface';
import {
  RECORDING_DOMAIN_EVENTS,
  RECORDING_EVENTS,
  type RecordingEventPayload,
  type RecordingStartedDomainPayload,
} from '../events/recording.events';
import { ObjectStorageService } from '../storage/object-storage.service';
import { RecordingUploadService } from '../upload/recording-upload.service';

export type RecordingLifecycleEvent = 'started' | 'stopped' | 'completed' | 'failed';

export interface RecordingLifecycleRequest {
  platformUuid: string;
  event: RecordingLifecycleEvent;
  segmentId?: string;
  rtpSessionId?: string;
  localFilePath?: string;
  durationSeconds?: number;
  mediaFormat?: string;
  errorCode?: string;
}

export interface RecordingIntentRequest {
  platformUuid: string;
  action: 'pause' | 'resume' | 'stop';
  seq?: number;
}

const CORR_TTL_SEC = 86_400;

/** Phase 12 — recording lifecycle, metadata, upload orchestration (ADR-029). */
@Injectable()
export class RecordingLifecycleService {
  private readonly logger = new Logger(RecordingLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly storage: ObjectStorageService,
    private readonly upload: RecordingUploadService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(CALL_EVENTS.ANSWERED)
  async onCallAnswered(payload: CallLifecyclePayload): Promise<void> {
    await this.startFromPolicy(payload.platformUuid);
  }

  @OnEvent(CALL_EVENTS.ENDED)
  async onCallEnded(payload: CallLifecyclePayload): Promise<void> {
    await this.stopActiveRecordings(payload.platformUuid, 'call_ended');
  }

  async handleLifecycle(
    dto: RecordingLifecycleRequest,
    meta: TelecomCallMeta,
  ): Promise<{ accepted: boolean; recordingId?: string; segmentId?: string }> {
    switch (dto.event) {
      case 'started':
        return this.onStarted(dto, meta);
      case 'stopped':
        return this.onStopped(dto, meta);
      case 'completed':
        return this.onCompleted(dto, meta);
      case 'failed':
        return this.onFailed(dto, meta);
      default:
        throw new BadRequestException('Unknown recording lifecycle event');
    }
  }

  async handleIntent(dto: RecordingIntentRequest): Promise<{ ok: boolean }> {
    const session = await this.requireSession(dto.platformUuid);
    const active = await this.redis.get(this.redis.recordingActiveKey(session.tenantId, dto.platformUuid));
    if (!active) {
      throw new ConflictException('No active recording');
    }
    if (dto.action === 'stop') {
      await this.stopActiveRecordings(dto.platformUuid, 'intent_stop');
    }
    this.logger.log(
      JSON.stringify({
        event: 'recording.intent',
        platformUuid: dto.platformUuid,
        action: dto.action,
        seq: dto.seq,
      }),
    );
    return { ok: true };
  }

  async startFromPolicy(platformUuid: string): Promise<void> {
    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid, deletedAt: null },
      select: { id: true, tenantId: true, fromLineId: true, toLineId: true },
    });
    if (!session) return;

    const runtime = await this.redis.get(this.redis.corrPlatformKey(session.tenantId, platformUuid));
    if (runtime) {
      try {
        const parsed = JSON.parse(runtime) as { recordingEnabled?: boolean };
        if (parsed.recordingEnabled === false) return;
      } catch {
        /* continue */
      }
    }

    const segmentId = randomUUID().replace(/-/g, '').slice(0, 16);
    await this.createRecordingRow({
      tenantId: session.tenantId,
      callSessionId: session.id,
      platformUuid,
      lineId: session.fromLineId ?? session.toLineId ?? undefined,
      segmentId,
    });
  }

  private async onStarted(
    dto: RecordingLifecycleRequest,
    meta: TelecomCallMeta,
  ): Promise<{ accepted: boolean; recordingId: string; segmentId: string }> {
    const session = await this.requireSession(dto.platformUuid);
    const segmentId = dto.segmentId ?? randomUUID().replace(/-/g, '').slice(0, 16);
    const recordingId = await this.createRecordingRow({
      tenantId: session.tenantId,
      callSessionId: session.id,
      platformUuid: dto.platformUuid,
      lineId: session.fromLineId ?? session.toLineId ?? undefined,
      segmentId,
      rtpSessionId: dto.rtpSessionId,
    });

    if (dto.rtpSessionId) {
      await this.redis.setex(
        this.redis.corrRecordingKey(session.tenantId, dto.rtpSessionId),
        CORR_TTL_SEC,
        JSON.stringify({ platformUuid: dto.platformUuid, recordingId, segmentId }),
      );
    }

    void meta;
    return { accepted: true, recordingId, segmentId };
  }

  private async onStopped(
    dto: RecordingLifecycleRequest,
    meta: TelecomCallMeta,
  ): Promise<{ accepted: boolean; recordingId?: string; segmentId?: string }> {
    await this.stopActiveRecordings(dto.platformUuid, 'stopped');
    void meta;
    return { accepted: true, segmentId: dto.segmentId };
  }

  private async onCompleted(
    dto: RecordingLifecycleRequest,
    meta: TelecomCallMeta,
  ): Promise<{ accepted: boolean; recordingId: string; segmentId: string }> {
    const session = await this.requireSession(dto.platformUuid);
    const segmentId = dto.segmentId ?? randomUUID().replace(/-/g, '').slice(0, 16);
    const activeRaw = await this.redis.get(
      this.redis.recordingActiveKey(session.tenantId, dto.platformUuid),
    );
    let recordingId: string;
    if (activeRaw) {
      recordingId = (JSON.parse(activeRaw) as { recordingId: string }).recordingId;
    } else {
      recordingId = await this.createRecordingRow({
        tenantId: session.tenantId,
        callSessionId: session.id,
        platformUuid: dto.platformUuid,
        lineId: session.fromLineId ?? session.toLineId ?? undefined,
        segmentId,
      });
    }

    const objectKey = this.storage.buildObjectKey({
      tenantId: session.tenantId,
      platformUuid: dto.platformUuid,
      segmentId,
      ext: dto.mediaFormat ?? 'wav',
    });

    if (dto.localFilePath) {
      await this.upload.uploadFromSpool({
        localPath: dto.localFilePath,
        objectKey,
        contentType: 'audio/wav',
      });
    } else {
      await this.upload.uploadPlaceholder({ objectKey });
    }

    const endedAt = new Date();
    const startedAt = await this.recordingStartedAt(recordingId);
    const durationSeconds =
      dto.durationSeconds ??
      (startedAt ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)) : undefined);

    await this.prisma.recording.update({
      where: { id: recordingId },
      data: {
        status: RecordingStatus.COMPLETED,
        endedAt,
        durationSeconds: durationSeconds ?? null,
        mediaObjectKey: objectKey,
        mediaFormat: dto.mediaFormat ?? 'wav',
      },
    });

    await this.redis.del(this.redis.recordingActiveKey(session.tenantId, dto.platformUuid));
    if (dto.rtpSessionId) {
      await this.redis.del(this.redis.corrRecordingKey(session.tenantId, dto.rtpSessionId));
    }

    this.emitRecordingEvent(RECORDING_EVENTS.COMPLETED, {
      tenantId: session.tenantId,
      platformUuid: dto.platformUuid,
      callSessionId: session.id,
      recordingId,
      segmentId,
      mediaObjectKey: objectKey,
      durationSeconds,
    });

    void meta;
    return { accepted: true, recordingId, segmentId };
  }

  private async onFailed(
    dto: RecordingLifecycleRequest,
    meta: TelecomCallMeta,
  ): Promise<{ accepted: boolean; recordingId?: string; segmentId?: string }> {
    const session = await this.requireSession(dto.platformUuid);
    const activeRaw = await this.redis.get(
      this.redis.recordingActiveKey(session.tenantId, dto.platformUuid),
    );
    if (activeRaw) {
      const { recordingId, segmentId } = JSON.parse(activeRaw) as {
        recordingId: string;
        segmentId: string;
      };
      await this.prisma.recording.update({
        where: { id: recordingId },
        data: { status: RecordingStatus.FAILED, endedAt: new Date() },
      });
      this.emitRecordingEvent(RECORDING_EVENTS.FAILED, {
        tenantId: session.tenantId,
        platformUuid: dto.platformUuid,
        callSessionId: session.id,
        recordingId,
        segmentId,
        errorCode: dto.errorCode ?? 'upload_failed',
      });
      await this.redis.del(this.redis.recordingActiveKey(session.tenantId, dto.platformUuid));
    }
    void meta;
    return { accepted: true, segmentId: dto.segmentId };
  }

  private async createRecordingRow(params: {
    tenantId: string;
    callSessionId: string;
    platformUuid: string;
    lineId?: string;
    segmentId: string;
    rtpSessionId?: string;
  }): Promise<string> {
    const recordingId = randomUUID();
    const publicId = `rec_${recordingId.replace(/-/g, '').slice(0, 16)}`;
    const startedAt = new Date();

    await this.prisma.recording.create({
      data: {
        id: recordingId,
        publicId,
        tenantId: params.tenantId,
        callSessionId: params.callSessionId,
        lineId: params.lineId ?? null,
        status: RecordingStatus.RECORDING,
        startedAt,
      },
    });

    await this.redis.setex(
      this.redis.recordingActiveKey(params.tenantId, params.platformUuid),
      CORR_TTL_SEC,
      JSON.stringify({
        recordingId,
        segmentId: params.segmentId,
        startedAt: startedAt.toISOString(),
        rtpSessionId: params.rtpSessionId,
      }),
    );

    this.emitRecordingEvent(RECORDING_EVENTS.STARTED, {
      tenantId: params.tenantId,
      platformUuid: params.platformUuid,
      callSessionId: params.callSessionId,
      recordingId,
      segmentId: params.segmentId,
    });

    const domain: RecordingStartedDomainPayload = {
      recordingId,
      platformUuid: params.platformUuid,
      tenantId: params.tenantId,
      callSessionId: params.callSessionId,
      segmentId: params.segmentId,
      ts: startedAt.toISOString(),
    };
    this.events.emit(RECORDING_DOMAIN_EVENTS.STARTED, domain);

    return recordingId;
  }

  private async stopActiveRecordings(platformUuid: string, reason: string): Promise<void> {
    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid, deletedAt: null },
      select: { id: true, tenantId: true },
    });
    if (!session) return;

    const activeRaw = await this.redis.get(
      this.redis.recordingActiveKey(session.tenantId, platformUuid),
    );
    if (!activeRaw) return;

    const { recordingId, segmentId } = JSON.parse(activeRaw) as {
      recordingId: string;
      segmentId: string;
    };

    await this.prisma.recording.updateMany({
      where: { id: recordingId, status: RecordingStatus.RECORDING },
      data: { status: RecordingStatus.PENDING, endedAt: new Date() },
    });

    this.logger.log(
      JSON.stringify({
        event: 'recording.stopped',
        platformUuid,
        recordingId,
        reason,
      }),
    );

    this.emitRecordingEvent(RECORDING_EVENTS.PAUSED, {
      tenantId: session.tenantId,
      platformUuid,
      callSessionId: session.id,
      recordingId,
      segmentId,
    });
  }

  private emitRecordingEvent(
    type: RecordingEventPayload['type'],
    params: Omit<RecordingEventPayload, 'eventId' | 'type' | 'ts'>,
  ): void {
    const payload: RecordingEventPayload = {
      eventId: randomUUID(),
      type,
      ts: new Date().toISOString(),
      ...params,
    };
    this.events.emit(type, payload);
    this.logger.log(JSON.stringify({ event: type, ...params }));
  }

  private async requireSession(platformUuid: string) {
    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid, deletedAt: null },
      select: { id: true, tenantId: true, fromLineId: true, toLineId: true },
    });
    if (!session) {
      throw new NotFoundException(`CallSession not found for platformUuid=${platformUuid}`);
    }
    return session;
  }

  private async recordingStartedAt(recordingId: string): Promise<Date | null> {
    const row = await this.prisma.recording.findUnique({
      where: { id: recordingId },
      select: { startedAt: true },
    });
    return row?.startedAt ?? null;
  }

  async listByCallSession(tenantId: string, callSessionId: string) {
    return this.prisma.recording.findMany({
      where: { tenantId, callSessionId, deletedAt: null },
      orderBy: { startedAt: 'asc' },
    });
  }

  async getSignedUrl(tenantId: string, recordingId: string): Promise<string | null> {
    const rec = await this.prisma.recording.findFirst({
      where: { id: recordingId, tenantId, deletedAt: null, status: RecordingStatus.COMPLETED },
    });
    if (!rec?.mediaObjectKey) return null;
    return this.storage.signedUrl(rec.mediaObjectKey);
  }
}
