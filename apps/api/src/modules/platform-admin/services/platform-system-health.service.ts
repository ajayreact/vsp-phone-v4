import { Injectable } from '@nestjs/common';
import {
  EnterpriseHealthService,
  type HealthCheckResult,
} from '../../enterprise-observability/health/enterprise-health.service';
import { DeploymentReadinessService } from '../../production-platform/deployment/deployment-readiness.service';

export type PlatformSystemHealthDetail = {
  components: Record<string, HealthCheckResult>;
  readiness: {
    ready: boolean;
    checks: Array<{ name: string; status: string; message?: string }>;
  };
};

/**
 * Platform-plane system health — reuses the same probes as Ops `/v1/ops/health`
 * without exposing the Ops API surface to platform JWTs.
 */
@Injectable()
export class PlatformSystemHealthService {
  constructor(
    private readonly health: EnterpriseHealthService,
    private readonly deployment: DeploymentReadinessService,
  ) {}

  async getDetail(): Promise<PlatformSystemHealthDetail> {
    const [components, report] = await Promise.all([
      this.health.checkAll(),
      this.deployment.buildReport(),
    ]);

    const checks = Object.entries(report.components).map(([name, check]) => ({
      name,
      status: check.status === 'ready' ? 'pass' : check.status,
      message: check.detail,
    }));

    return {
      components,
      readiness: {
        ready: report.ready,
        checks,
      },
    };
  }
}
