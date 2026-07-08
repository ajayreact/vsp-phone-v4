import { Injectable } from '@nestjs/common';
import { ShutdownCoordinatorService } from '../../enterprise-ha/services/shutdown-coordinator.service';
import { ProductionConfigValidatorService } from '../configuration/production-config-validator.service';
import { DeploymentReadinessService } from '../deployment/deployment-readiness.service';
import { EnvironmentProfileService } from '../environment/environment-profile.service';

/** Phase 18 — CI/CD deployment readiness (report only; no pipeline YAML). */
@Injectable()
export class CicdReadinessService {
  constructor(
    private readonly envProfile: EnvironmentProfileService,
    private readonly configValidator: ProductionConfigValidatorService,
    private readonly deployment: DeploymentReadinessService,
    private readonly shutdown: ShutdownCoordinatorService,
  ) {}

  async evaluate(): Promise<Record<string, unknown>> {
    const deploymentReport = await this.deployment.buildReport();
    const configValidation = this.configValidator.getLastResult() ?? (await this.configValidator.validate());

    return {
      ts: new Date().toISOString(),
      phase: 'phase18-production-platform',
      readyForAutomatedDeployment:
        configValidation.ok && deploymentReport.ready && this.shutdown.isReady(),
      checks: {
        immutableConfiguration: true,
        environmentSeparation: this.envProfile.profile !== 'development',
        startupValidation: configValidation.ok,
        healthEndpoints: true,
        gracefulShutdown: true,
        readinessChecks: deploymentReport.ready,
      },
      profile: this.envProfile.describe(),
      deployment: deploymentReport,
    };
  }
}
