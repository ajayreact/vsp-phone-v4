import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackupDrService } from '../../enterprise-ha/services/backup-dr.service';
import { ShutdownCoordinatorService } from '../../enterprise-ha/services/shutdown-coordinator.service';
import { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import { ProductionConfigValidatorService } from '../configuration/production-config-validator.service';
import { EnvironmentProfileService } from '../environment/environment-profile.service';

export interface DeploymentReadinessReport {
  ts: string;
  phase: 'phase18-production-platform';
  profile: string;
  ready: boolean;
  components: Record<string, { status: 'ready' | 'degraded' | 'not_ready'; detail?: string }>;
}

/** Phase 18 — deployment readiness for API, DB, Redis, Kamailio, RTPengine, carrier, WebRTC, provisioning. */
@Injectable()
export class DeploymentReadinessService {
  constructor(
    private readonly config: ConfigService,
    private readonly envProfile: EnvironmentProfileService,
    private readonly configValidator: ProductionConfigValidatorService,
    private readonly health: EnterpriseHealthService,
    private readonly backupDr: BackupDrService,
    private readonly shutdown: ShutdownCoordinatorService,
  ) {}

  async buildReport(): Promise<DeploymentReadinessReport> {
    const [api, postgres, redis, kamailio, rtpengine, telnyx] = await Promise.all([
      this.health.checkApi(),
      this.health.checkPostgres(),
      this.health.checkRedis(),
      this.health.checkKamailio(),
      this.health.checkRtpengine(),
      this.health.checkTelnyx(),
    ]);

    const configResult = this.configValidator.getLastResult() ?? (await this.configValidator.validate());
    const backup = this.backupDr.status();
    const webrtcReady = Boolean(this.config.get('WEBRTC_WSS_URL') || this.config.get('JWT_SECRET') || this.config.get('DEV_JWT_SECRET'));
    const provReady = String(this.config.get('PROV_HTTPS_ENABLED') ?? 'true').toLowerCase() !== 'false';

    const components = {
      api: this.mapStatus(api.status === 'up' && !this.shutdown.isDraining(), 'API healthy and not draining'),
      database: this.mapStatus(postgres.status === 'up', postgres.failureReason),
      redis: this.mapStatus(redis.status === 'up', redis.failureReason),
      kamailio: this.mapStatus(kamailio.status === 'up', kamailio.failureReason),
      rtpengine: this.mapStatus(rtpengine.status === 'up', rtpengine.failureReason),
      carrier: this.mapStatus(telnyx.status !== 'down', telnyx.failureReason),
      webrtc: this.mapStatus(webrtcReady, webrtcReady ? undefined : 'WEBRTC/JWT not configured'),
      provisioning: this.mapStatus(provReady, provReady ? undefined : 'provisioning disabled'),
      configuration: this.mapStatus(configResult.ok, configResult.errors.join(', ') || undefined),
      backup: this.mapStatus(
        backup.backupLocationConfigured || this.envProfile.profile === 'development',
        backup.backupLocationConfigured ? undefined : 'BACKUP_LOCATION not set',
      ),
    };

    const ready = Object.values(components).every((c) => c.status === 'ready');

    return {
      ts: new Date().toISOString(),
      phase: 'phase18-production-platform',
      profile: this.envProfile.profile,
      ready,
      components,
    };
  }

  private mapStatus(ok: boolean, detail?: string): { status: 'ready' | 'degraded' | 'not_ready'; detail?: string } {
    if (ok) return { status: 'ready', detail };
    return { status: detail?.includes('degraded') ? 'degraded' : 'not_ready', detail };
  }
}
