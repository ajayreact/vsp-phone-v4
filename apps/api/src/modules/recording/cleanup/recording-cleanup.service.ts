import { Injectable, Logger } from '@nestjs/common';
import { RecordingStatus } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';

/** Phase 12 — mark stale recordings failed; optional object cleanup. */
@Injectable()
export class RecordingCleanupService {
  private readonly logger = new Logger(RecordingCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async reconcileStale(params: { graceMinutes?: number } = {}): Promise<number> {
    if (!this.prisma.connected) return 0;
    const graceMs = (params.graceMinutes ?? 60) * 60 * 1000;
    const cutoff = new Date(Date.now() - graceMs);
    const stale = await this.prisma.recording.findMany({
      where: {
        deletedAt: null,
        status: { in: [RecordingStatus.PENDING, RecordingStatus.RECORDING] },
        startedAt: { lt: cutoff },
      },
      take: 100,
    });

    for (const rec of stale) {
      await this.prisma.recording.update({
        where: { id: rec.id },
        data: { status: RecordingStatus.FAILED, endedAt: new Date() },
      });
      this.logger.warn(
        JSON.stringify({
          event: 'recording.cleanup.stale',
          recordingId: rec.id,
          platformUuid: 'unknown',
        }),
      );
    }
    return stale.length;
  }

  async softDelete(tenantId: string, recordingId: string): Promise<void> {
    const rec = await this.prisma.recording.findFirst({
      where: { id: recordingId, tenantId, deletedAt: null },
    });
    if (!rec) return;
    await this.prisma.recording.update({
      where: { id: recordingId },
      data: { status: RecordingStatus.DELETED, deletedAt: new Date() },
    });
    if (rec.mediaObjectKey) {
      await this.storage.deleteObject(rec.mediaObjectKey);
    }
  }
}
