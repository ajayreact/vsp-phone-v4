import { Injectable } from '@nestjs/common';
import { KamailioNodeRegistryService } from '../../enterprise-ha/failover/kamailio-node-registry.service';
import { KamailioPersistenceService } from '../../enterprise-ha/backup/kamailio-persistence.service';
import { KamailioRpcClient } from '../clients/kamailio-rpc.client';

@Injectable()
export class OpsKamailioService {
  constructor(
    private readonly rpc: KamailioRpcClient,
    private readonly nodes: KamailioNodeRegistryService,
    private readonly persistence: KamailioPersistenceService,
  ) {}

  async getDashboard() {
    const [uptime, shmmem, dialogs, tmStats, dispatcher, nodes, persistence] = await Promise.all([
      this.rpc.tryCall('core.uptime', []),
      this.rpc.tryCall('core.shmmem', []),
      this.rpc.tryCall('dlg.stats', []),
      this.rpc.tryCall('tm.stats', []),
      this.rpc.tryCall('dispatcher.list', []),
      Promise.resolve(this.nodes.listNodes()),
      Promise.resolve(this.persistence.evaluate()),
    ]);

    return {
      rpcConfigured: this.rpc.isConfigured(),
      uptime: uptime.result ?? null,
      shmmem: shmmem.result ?? null,
      dialogStats: dialogs.result ?? null,
      transactionStats: tmStats.result ?? null,
      dispatcher: dispatcher.result ?? null,
      nodes,
      persistence,
      workers: null,
      routes: null,
      gateways: dispatcher.result ?? null,
    };
  }

  async reload(actorNote?: string) {
    const result = await this.rpc.tryCall('core.reload', []);
    return { ok: result.ok, error: result.error, actorNote };
  }
}
