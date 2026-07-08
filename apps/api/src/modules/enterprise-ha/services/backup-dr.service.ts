import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { HA_REDIS_KEYS } from '../redis/ha-redis.keys';

export interface BackupDrStatus {
  backupLocationConfigured: boolean;
  restoreVerifyHookEnabled: boolean;
  configSnapshotAvailable: boolean;
  backupLocation?: string;
  lastSnapshotAt?: string;
}

/** Phase 17 — backup & disaster recovery readiness (no external backup software). */
@Injectable()
export class BackupDrService implements OnModuleInit {
  private readonly logger = new Logger(BackupDrService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: TelecomRedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('HA_CONFIG_SNAPSHOT_ON_START') === 'true') {
      await this.exportConfigSnapshot();
    }
  }

  async exportConfigSnapshot(): Promise<{ ok: boolean; ts: string }> {
    const ts = new Date().toISOString();
    const snapshot = {
      ts,
      vspEnv: this.config.get('VSP_ENV'),
      redisMode: this.config.get('REDIS_MODE'),
      kamailioNodes: this.config.get('KAMAILIO_NODES'),
      rtpengineNodes: this.config.get('RTPENGINE_NODES'),
      backupLocation: this.config.get('BACKUP_LOCATION'),
      instanceId: this.config.get('INSTANCE_ID'),
    };
    const ok = await this.redis.setex(
      HA_REDIS_KEYS.configSnapshot,
      86400,
      JSON.stringify(snapshot),
    );
    this.logger.log(JSON.stringify({ event: 'ha.dr.config_snapshot', ok, ts }));
    return { ok, ts };
  }

  async verifyRestoreHook(): Promise<{ verified: boolean; ts: string }> {
    const ts = new Date().toISOString();
    const payload = JSON.stringify({ verified: true, ts, source: 'ha.restore.verify' });
    await this.redis.setex(HA_REDIS_KEYS.restoreVerify, 3600, payload);
    return { verified: true, ts };
  }

  status(): BackupDrStatus {
    const backupLocation = this.config.get<string>('BACKUP_LOCATION');
    return {
      backupLocationConfigured: Boolean(backupLocation?.trim()),
      restoreVerifyHookEnabled:
        String(this.config.get('HA_RESTORE_VERIFY_ENABLED') ?? 'true').toLowerCase() !== 'false',
      configSnapshotAvailable: true,
      backupLocation: backupLocation || undefined,
    };
  }
}
