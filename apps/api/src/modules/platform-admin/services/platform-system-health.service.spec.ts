import type { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import type { DeploymentReadinessService } from '../../production-platform/deployment/deployment-readiness.service';
import { PlatformSystemHealthService } from './platform-system-health.service';

describe('PlatformSystemHealthService', () => {
  it('aggregates components and maps readiness.components → checks', async () => {
    const health = {
      checkAll: jest.fn().mockResolvedValue({
        api: { status: 'up' },
        redis: { status: 'up' },
      }),
    };
    const deployment = {
      buildReport: jest.fn().mockResolvedValue({
        ready: false,
        components: {
          api: { status: 'ready' },
          redis: { status: 'not_ready', detail: 'ping failed' },
        },
      }),
    };

    const svc = new PlatformSystemHealthService(
      health as unknown as EnterpriseHealthService,
      deployment as unknown as DeploymentReadinessService,
    );

    const detail = await svc.getDetail();

    expect(detail.components.api.status).toBe('up');
    expect(detail.readiness.ready).toBe(false);
    expect(detail.readiness.checks).toEqual([
      { name: 'api', status: 'pass', message: undefined },
      { name: 'redis', status: 'not_ready', message: 'ping failed' },
    ]);
  });
});
