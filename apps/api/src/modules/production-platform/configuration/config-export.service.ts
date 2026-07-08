import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import {
  EXPORTABLE_ENV_KEYS,
  PRODUCTION_REDIS_KEYS,
} from './production-config.constants';

export interface ConfigExportPayload {
  exportedAt: string;
  phase: 'phase18-production-platform';
  platform: Record<string, string | number | boolean | undefined>;
  carrier: Record<string, string | number | boolean | undefined>;
  queue: Record<string, string | number | boolean | undefined>;
  ivr: Record<string, string | number | boolean | undefined>;
  provisioning: Record<string, string | number | boolean | undefined>;
  featureCodes: Record<string, string>;
  secretsExcluded: true;
}

/** Phase 18 — export non-sensitive runtime configuration (never secrets). */
@Injectable()
export class ConfigExportService {
  constructor(
    private readonly config: ConfigService,
    private readonly redis: TelecomRedisService,
  ) {}

  async export(): Promise<ConfigExportPayload> {
    const platform: Record<string, string | number | boolean | undefined> = {};
    for (const key of EXPORTABLE_ENV_KEYS) {
      platform[key] = this.config.get(key);
    }

    const payload: ConfigExportPayload = {
      exportedAt: new Date().toISOString(),
      phase: 'phase18-production-platform',
      platform,
      carrier: {
        telnyxSipHost: this.config.get('TELNYX_SIP_HOST'),
        telnyxDispatcherSet: this.config.get('TELNYX_DISPATCHER_SET'),
        telnyxApiBaseUrl: this.config.get('TELNYX_API_BASE_URL'),
      },
      queue: {
        queueMediaUri: this.config.get('QUEUE_MEDIA_URI'),
        queueWaitSec: this.config.get('QUEUE_WAIT_SEC'),
        queueRetryMax: this.config.get('QUEUE_RETRY_MAX'),
        queueOverflowDest: this.config.get('QUEUE_OVERFLOW_DEST'),
      },
      ivr: {
        ivrMediaUri: this.config.get('IVR_MEDIA_URI'),
        ivrTimeoutSec: this.config.get('IVR_TIMEOUT_SEC'),
        conferenceMediaUri: this.config.get('CONFERENCE_MEDIA_URI'),
        voicemailMediaUri: this.config.get('VOICEMAIL_MEDIA_URI'),
      },
      provisioning: {
        provHttpsEnabled: this.config.get('PROV_HTTPS_ENABLED'),
        provPublicBaseUrl: this.config.get('PROV_PUBLIC_BASE_URL'),
        provFirmwareStable: this.config.get('PROV_FIRMWARE_STABLE_VERSION'),
        provArtifactRoot: this.config.get('PROV_ARTIFACT_ROOT'),
      },
      featureCodes: await this.exportFeatureCodes(),
      secretsExcluded: true,
    };

    setImmediate(() => {
      void this.redis.setex(
        PRODUCTION_REDIS_KEYS.configExport,
        86400,
        JSON.stringify(payload),
      );
    });

    return payload;
  }

  private async exportFeatureCodes(): Promise<Record<string, string>> {
    const keys = await this.redis.scanKeys('vsp:*:ops:feature:*');
    const out: Record<string, string> = {};
    for (const key of keys.slice(0, 200)) {
      const val = await this.redis.get(key);
      if (val) out[key] = val;
    }
    return out;
  }
}
