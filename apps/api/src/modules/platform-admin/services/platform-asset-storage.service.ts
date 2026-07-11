import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ObjectStorageService } from '../../recording/storage/object-storage.service';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const MAX_BYTES = 2 * 1024 * 1024;

@Injectable()
export class PlatformAssetStorageService {
  private readonly logger = new Logger(PlatformAssetStorageService.name);
  private readonly localRoot: string;

  constructor(
    private readonly config: ConfigService,
    private readonly objectStorage: ObjectStorageService,
  ) {
    this.localRoot = join(process.cwd(), 'uploads', 'branding');
  }

  async uploadTenantLogo(file: { buffer: Buffer; mimetype: string; originalname: string; size: number }): Promise<{
    logoUrl: string;
    previewUrl: string;
  }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Logo file is required');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Logo must be 2 MB or smaller');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Logo must be PNG, JPEG, WebP, GIF, or SVG');
    }

    const ext = this.extFromMime(file.mimetype) ?? (extname(file.originalname).slice(1) || 'png');
    const objectKey = `tenant-logos/${randomUUID()}.${ext}`;

    const endpoint = (this.config.get<string>('S3_ENDPOINT') || '').trim();
    if (endpoint) {
      await this.objectStorage.uploadBuffer({
        objectKey,
        body: file.buffer,
        contentType: file.mimetype,
      });
    } else {
      const dir = join(this.localRoot, 'tenant-logos');
      await mkdir(dir, { recursive: true });
      await writeFile(join(this.localRoot, objectKey), file.buffer);
      this.logger.log(JSON.stringify({ event: 'platform.logo.local_upload', objectKey }));
    }

    const previewUrl = `/v1/platform/assets/${encodeURIComponent(objectKey)}`;
    return { logoUrl: objectKey, previewUrl };
  }

  async resolveAssetStream(objectKey: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
    if (!objectKey.startsWith('tenant-logos/')) {
      throw new NotFoundException('Asset not found');
    }

    const localPath = join(this.localRoot, objectKey);
    if (existsSync(localPath)) {
      return {
        stream: createReadStream(localPath),
        contentType: this.mimeFromExt(extname(objectKey)) ?? 'application/octet-stream',
      };
    }

    const signed = await this.objectStorage.signedUrl(objectKey);
    if (!signed) throw new NotFoundException('Asset not found');

    const res = await fetch(signed);
    if (!res.ok || !res.body) throw new NotFoundException('Asset not found');

    return {
      stream: res.body as unknown as NodeJS.ReadableStream,
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  private extFromMime(mime: string): string | null {
    switch (mime) {
      case 'image/png':
        return 'png';
      case 'image/jpeg':
        return 'jpg';
      case 'image/webp':
        return 'webp';
      case 'image/gif':
        return 'gif';
      case 'image/svg+xml':
        return 'svg';
      default:
        return null;
    }
  }

  private mimeFromExt(ext: string): string | null {
    switch (ext.toLowerCase()) {
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      case '.svg':
        return 'image/svg+xml';
      default:
        return null;
    }
  }
}
