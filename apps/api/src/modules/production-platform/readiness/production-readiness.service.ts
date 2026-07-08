import { Injectable } from '@nestjs/common';
import { DeploymentReadinessService } from '../deployment/deployment-readiness.service';

/** Phase 18 — production readiness report facade. */
@Injectable()
export class ProductionReadinessService {
  constructor(private readonly deployment: DeploymentReadinessService) {}

  buildReport() {
    return this.deployment.buildReport();
  }
}
