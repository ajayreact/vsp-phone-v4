import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeploymentReadinessService } from '../../production-platform/deployment/deployment-readiness.service';
import { ShutdownCoordinatorService } from '../../enterprise-ha/services/shutdown-coordinator.service';

/** Phase 19 — production safety gates (Phases 17/18 integration). */
@Injectable()
export class MigrationSafetyService {
  constructor(
    private readonly config: ConfigService,
    private readonly deployment: DeploymentReadinessService,
    private readonly shutdown: ShutdownCoordinatorService,
  ) {}

  async assertReadyForMigration(): Promise<void> {
    if (this.shutdown.isDraining()) {
      throw new ServiceUnavailableException('Migration blocked: API is shutting down');
    }

    const vspEnv = this.config.get<string>('VSP_ENV') ?? 'development';
    const requireReady =
      String(this.config.get('MIGRATION_REQUIRE_READINESS') ?? 'false').toLowerCase() === 'true' ||
      vspEnv === 'production';

    if (!requireReady) return;

    const report = await this.deployment.buildReport();
    if (!report.ready) {
      throw new ServiceUnavailableException({
        message: 'Migration blocked: production readiness checks failed',
        components: report.components,
      });
    }
  }
}
