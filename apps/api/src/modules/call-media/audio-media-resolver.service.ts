import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MohPlayMode } from '@prisma/client';
import { PrismaService } from '../telecom/prisma/prisma.service';
import { ObjectStorageService } from '../recording/storage/object-storage.service';

/** Resolves tenant audio library assets to media-app URIs for live call runtime. */
@Injectable()
export class AudioMediaResolverService {
  private readonly mohBaseUri: string;
  private readonly promptBaseUri: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    config: ConfigService,
  ) {
    this.mohBaseUri = config.get<string>('MOH_DEFAULT_URI') || 'sip:moh-default@media.vsp.internal';
    this.promptBaseUri = (config.get<string>('PROMPT_BASE_URI') || 'sip:prompts@vsp.internal').replace(/\/$/, '');
  }

  async resolveMohUri(tenantId: string, playlistId?: string | null): Promise<string> {
    if (!playlistId || !this.prisma.connected) {
      return this.mohBaseUri;
    }

    const playlist = await this.prisma.mohPlaylist.findFirst({
      where: { id: playlistId, tenantId, deletedAt: null },
      include: {
        tracks: { where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { trackPriority: 'desc' }] },
      },
    });

    if (!playlist) return this.mohBaseUri;

    if (playlist.streamingUrl) {
      return playlist.streamingUrl;
    }

    const params = new URLSearchParams({
      tenant: tenantId,
      playlist: playlist.id,
      mode: playlist.playMode ?? MohPlayMode.SEQUENTIAL,
      lang: playlist.language ?? 'en',
    });

    if (playlist.tracks.length) {
      params.set('tracks', playlist.tracks.map((t) => t.id).join(','));
    }

    return `${this.mohBaseUri}?${params.toString()}`;
  }

  async resolveAnnouncementUri(tenantId: string, announcementId: string): Promise<string | null> {
    if (!this.prisma.connected) return null;

    const ann = await this.prisma.announcement.findFirst({
      where: { id: announcementId, tenantId, deletedAt: null },
    });
    if (!ann) return null;

    if (ann.mediaObjectKey) {
      return `${this.promptBaseUri}/${tenantId}/${ann.id}?key=${encodeURIComponent(ann.mediaObjectKey)}`;
    }
    if (ann.ttsText) {
      return `${this.promptBaseUri}/${tenantId}/${ann.id}?tts=1`;
    }
    return null;
  }

  async resolveAnnouncementUris(tenantId: string, ids: string[]): Promise<string[]> {
    const uris: string[] = [];
    for (const id of ids) {
      const uri = await this.resolveAnnouncementUri(tenantId, id);
      if (uri) uris.push(uri);
    }
    return uris;
  }

  async resolveAnnouncementByCategory(
    tenantId: string,
    category: string,
    language?: string,
  ): Promise<string[]> {
    if (!this.prisma.connected) return [];

    const rows = await this.prisma.announcement.findMany({
      where: {
        tenantId,
        deletedAt: null,
        category: category as never,
        ...(language ? { language } : {}),
      },
      orderBy: { name: 'asc' },
      take: 20,
    });

    const uris: string[] = [];
    for (const row of rows) {
      const uri = await this.resolveAnnouncementUri(tenantId, row.id);
      if (uri) uris.push(uri);
    }
    return uris;
  }

  async signedPreviewUrl(objectKey: string): Promise<string | null> {
    return this.storage.signedUrl(objectKey, 900);
  }
}
