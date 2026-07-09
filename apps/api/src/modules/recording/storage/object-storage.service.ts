import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

/** Phase 12 — MinIO/S3 object storage for recording media (ADR-029). */
@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET_RECORDINGS', 'vsp-recordings');
    this.enabled = String(config.get('RECORDING_UPLOAD_ENABLED') ?? 'true').toLowerCase() !== 'false';
    const endpoint = (config.get<string>('S3_ENDPOINT') || '').trim();
    if (!endpoint || !this.enabled) {
      this.client = null;
      return;
    }
    this.client = new S3Client({
      endpoint,
      region: config.get<string>('S3_REGION', 'us-east-1'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get<string>('S3_ACCESS_KEY', 'vspminio'),
        secretAccessKey: config.get<string>('S3_SECRET_KEY', 'vsp_minio_dev_password'),
      },
    });
  }

  buildObjectKey(params: {
    tenantId: string;
    platformUuid: string;
    segmentId: string;
    ext?: string;
    at?: Date;
  }): string {
    const at = params.at ?? new Date();
    const yyyy = at.getUTCFullYear();
    const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(at.getUTCDate()).padStart(2, '0');
    const ext = params.ext ?? 'wav';
    return `recordings/${params.tenantId}/${yyyy}/${mm}/${dd}/${params.platformUuid}/${params.segmentId}.${ext}`;
  }

  async uploadFile(params: {
    objectKey: string;
    localPath: string;
    contentType?: string;
  }): Promise<{ objectKey: string; bytes: number }> {
    if (!this.client) {
      this.logger.warn(JSON.stringify({ event: 'recording.storage.disabled', key: params.objectKey }));
      return { objectKey: params.objectKey, bytes: 0 };
    }
    const info = await stat(params.localPath);
    const body = createReadStream(params.localPath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.objectKey,
        Body: body,
        ContentType: params.contentType ?? 'audio/wav',
      }),
    );
    this.logger.log(
      JSON.stringify({
        event: 'recording.storage.uploaded',
        bucket: this.bucket,
        key: params.objectKey,
        bytes: info.size,
      }),
    );
    return { objectKey: params.objectKey, bytes: info.size };
  }

  async uploadBuffer(params: {
    objectKey: string;
    body: Buffer;
    contentType?: string;
  }): Promise<{ objectKey: string; bytes: number }> {
    if (!this.client) {
      return { objectKey: params.objectKey, bytes: params.body.length };
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.objectKey,
        Body: params.body,
        ContentType: params.contentType ?? 'audio/wav',
      }),
    );
    return { objectKey: params.objectKey, bytes: params.body.length };
  }

  async signedUrl(objectKey: string, ttlSec = 900): Promise<string | null> {
    if (!this.client) return null;
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: objectKey });
    return getSignedUrl(this.client, cmd, { expiresIn: ttlSec });
  }

  async deleteObject(objectKey: string): Promise<void> {
    if (!this.client) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }
}
