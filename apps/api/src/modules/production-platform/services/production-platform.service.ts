import { Injectable } from '@nestjs/common';
import { CicdReadinessService } from '../deployment/cicd-readiness.service';
import { DeploymentReadinessService } from '../deployment/deployment-readiness.service';
import { ReleaseInfoService } from '../releases/release-info.service';

/** Phase 18 — production platform orchestration service. */
@Injectable()
export class ProductionPlatformService {
  constructor(
    private readonly deployment: DeploymentReadinessService,
    private readonly release: ReleaseInfoService,
    private readonly cicd: CicdReadinessService,
  ) {}

  readiness() {
    return this.deployment.buildReport();
  }

  version() {
    return this.release.getVersionInfo();
  }

  cicdReadiness() {
    return this.cicd.evaluate();
  }
}
