import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HaHealthService } from '../modules/enterprise-ha/health/ha-health.service';
import { ShutdownCoordinatorService } from '../modules/enterprise-ha/services/shutdown-coordinator.service';
import { EnterpriseHealthService } from '../modules/enterprise-observability/health/enterprise-health.service';

@Controller()
export class HealthController {
  constructor(
    private readonly enterpriseHealth: EnterpriseHealthService,
    private readonly haHealth: HaHealthService,
    private readonly shutdown: ShutdownCoordinatorService,
  ) {}

  @Get('health')
  liveliness() {
    return {
      status: 'ok',
      service: 'api',
      mode: 'remediation-complete',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/api')
  healthApi() {
    return this.enterpriseHealth.checkApi();
  }

  @Get('health/postgres')
  healthPostgres() {
    return this.enterpriseHealth.checkPostgres();
  }

  @Get('health/redis')
  healthRedis() {
    return this.enterpriseHealth.checkRedis();
  }

  @Get('health/kamailio')
  healthKamailio() {
    return this.enterpriseHealth.checkKamailio();
  }

  @Get('health/rtpengine')
  healthRtpengine() {
    return this.enterpriseHealth.checkRtpengine();
  }

  @Get('health/telnyx')
  healthTelnyx() {
    return this.enterpriseHealth.checkTelnyx();
  }

  @Get('ready')
  async readiness() {
    if (this.shutdown.isDraining()) {
      throw new ServiceUnavailableException({
        status: 'draining',
        service: 'api',
        timestamp: new Date().toISOString(),
      });
    }

    const appChecks = await this.enterpriseHealth.checkAll();
    const checks = {
      postgres: appChecks.postgres,
      redis: appChecks.redis,
      kamailio: appChecks.kamailio,
      rtpengine: appChecks.rtpengine,
      haReady: this.haHealth.isReadyForTraffic(),
    };

    const healthy =
      checks.postgres.status === 'up' &&
      checks.redis.status === 'up' &&
      checks.haReady &&
      checks.kamailio.status !== 'down' &&
      checks.rtpengine.status !== 'down';
    const body = {
      status: healthy ? 'ok' : 'degraded',
      service: 'api',
      timestamp: new Date().toISOString(),
      checks,
    };

    if (!healthy) {
      throw new ServiceUnavailableException(body);
    }

    return body;
  }
}
