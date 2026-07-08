import { Injectable, Logger } from '@nestjs/common';
import { ObjectStorageService } from '../storage/object-storage.service';

/** Phase 12 — spool → object storage upload (RTPengine recording path). */
@Injectable()
export class RecordingUploadService {
  private readonly logger = new Logger(RecordingUploadService.name);

  constructor(private readonly storage: ObjectStorageService) {}

  async uploadFromSpool(params: {
    localPath: string;
    objectKey: string;
    contentType?: string;
  }): Promise<void> {
    await this.storage.uploadFile({
      localPath: params.localPath,
      objectKey: params.objectKey,
      contentType: params.contentType,
    });
  }

  /** Dev fallback when RTPengine spool file is unavailable. */
  async uploadPlaceholder(params: { objectKey: string }): Promise<void> {
    const header = Buffer.from('RIFF....WAVEfmt ', 'ascii');
    await this.storage.uploadBuffer({
      objectKey: params.objectKey,
      body: header,
      contentType: 'audio/wav',
    });
    this.logger.debug(JSON.stringify({ event: 'recording.upload.placeholder', key: params.objectKey }));
  }
}
