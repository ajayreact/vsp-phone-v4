import { Injectable } from '@nestjs/common';
import { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import { KamailioRpcClient } from '../clients/kamailio-rpc.client';
import { RtpengineNgClient } from '../clients/rtpengine-ng.client';

@Injectable()
export class OpsSyntheticMonitoringService {
  constructor(
    private readonly health: EnterpriseHealthService,
    private readonly kamailio: KamailioRpcClient,
    private readonly rtpengine: RtpengineNgClient,
  ) {}

  async runHealthChecks() {
    const [components, kamailioPing, rtpPing] = await Promise.all([
      this.health.checkAllExtended(),
      this.kamailio.tryCall('core.uptime', []),
      this.rtpengine.ping(),
    ]);

    const checks = [
      { name: 'API', pass: components.api?.status === 'up' },
      { name: 'PostgreSQL', pass: components.postgres?.status === 'up' },
      { name: 'Redis', pass: components.redis?.status === 'up' },
      { name: 'Kamailio', pass: components.kamailio?.status === 'up' },
      { name: 'RTPengine', pass: components.rtpengine?.status === 'up' },
      { name: 'Telnyx', pass: components.telnyx?.status === 'up' },
      { name: 'MinIO', pass: components.minio?.status === 'up' || components.minio?.status === 'degraded' },
      { name: 'Kamailio RPC', pass: kamailioPing.ok },
      { name: 'RTPengine NG', pass: rtpPing.ok },
    ];

    return {
      passed: checks.every((c) => c.pass),
      checks,
      components,
      kamailio: kamailioPing,
      rtpengine: rtpPing,
      mediaVerification: rtpPing.ok,
      carrierVerification: components.telnyx?.status === 'up',
      ts: new Date().toISOString(),
    };
  }
}
