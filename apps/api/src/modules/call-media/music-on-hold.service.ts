import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudioMediaResolverService } from './audio-media-resolver.service';

/** Phase 13 — Music on Hold URIs (RTPengine anchors caller ↔ media app). */
@Injectable()
export class MusicOnHoldService {
  private readonly defaultMoh: string;

  constructor(
    private readonly resolver: AudioMediaResolverService,
    config: ConfigService,
  ) {
    this.defaultMoh =
      config.get<string>('MOH_DEFAULT_URI') || 'sip:moh-default@media.vsp.internal';
  }

  async mohUriForQueue(tenantId: string, queueId?: string, mohPlaylistId?: string | null): Promise<string> {
    if (mohPlaylistId) {
      return this.resolver.resolveMohUri(tenantId, mohPlaylistId);
    }
    const perQueue = process.env[`MOH_QUEUE_${queueId?.replace(/-/g, '_').toUpperCase()}_URI`];
    if (perQueue) return perQueue;
    return this.resolver.resolveMohUri(tenantId, null);
  }

  async holdUri(tenantId: string, mohPlaylistId?: string | null): Promise<string> {
    return mohPlaylistId
      ? this.resolver.resolveMohUri(tenantId, mohPlaylistId)
      : this.defaultMoh;
  }
}
