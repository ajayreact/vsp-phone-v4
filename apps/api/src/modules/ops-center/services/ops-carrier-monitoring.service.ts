import { Injectable } from '@nestjs/common';
import { TrunksAdminService } from '../../carrier-admin/services/trunks-admin.service';
import { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import { tcpProbe } from '../../../common/health/tcp-probe';

@Injectable()
export class OpsCarrierMonitoringService {
  constructor(
    private readonly health: EnterpriseHealthService,
    private readonly trunks: TrunksAdminService,
  ) {}

  async getOverview() {
    const [telnyx, trunkList] = await Promise.all([
      this.probeTelnyx(),
      this.trunks.list(),
    ]);

    const byoc = trunkList.filter((t) => !t.carrier.toLowerCase().includes('telnyx'));

    return {
      carriers: [
        { id: 'telnyx', name: 'Telnyx', type: 'TELNYX', ...telnyx },
        ...trunkList.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.carrier,
          health: t.health,
          latencyMs: t.latencyMs,
          optionsProbe: t.optionsPingMs != null ? 'up' : 'unknown',
          failures: t.lastFailureAt ? 1 : 0,
          registration: t.registration,
          activeCalls: t.concurrentCalls,
          capacity: { total: t.channelsTotal, inUse: t.channelsInUse },
        })),
      ],
      byoc,
    };
  }

  private async probeTelnyx() {
    const health = await this.health.checkTelnyx();
    const options = await tcpProbe('sip.telnyx.com', 5060, 2000);
    return {
      health: health.status,
      latencyMs: health.latencyMs,
      optionsProbe: options.status,
      failures: health.status === 'down' ? 1 : 0,
      registration: health.status,
      activeCalls: 0,
      capacity: null,
    };
  }
}
