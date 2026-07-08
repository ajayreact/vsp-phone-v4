import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Phase 13 — Music on Hold URIs (RTPengine anchors caller ↔ media app). */
@Injectable()
export class MusicOnHoldService {
  private readonly defaultMoh: string;

  constructor(config: ConfigService) {
    this.defaultMoh =
      config.get<string>('MOH_DEFAULT_URI') || 'sip:moh-default@media.vsp.internal';
  }

  mohUriForQueue(queueId?: string): string {
    const perQueue = process.env[`MOH_QUEUE_${queueId?.replace(/-/g, '_').toUpperCase()}_URI`];
    return perQueue || this.defaultMoh;
  }

  holdUri(): string {
    return this.defaultMoh;
  }
}
