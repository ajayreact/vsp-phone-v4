import { Injectable } from '@nestjs/common';
import { RtpengineNodeRegistryService } from '../../enterprise-ha/failover/rtpengine-node-registry.service';
import { OpsMediaMonitoringService } from './ops-media-monitoring.service';
import { RtpengineNgClient } from '../clients/rtpengine-ng.client';

@Injectable()
export class OpsRtpengineService {
  constructor(
    private readonly ng: RtpengineNgClient,
    private readonly nodes: RtpengineNodeRegistryService,
    private readonly media: OpsMediaMonitoringService,
  ) {}

  async getDashboard(tenantId?: string) {
    const [ping, list, nodeList, sessions] = await Promise.all([
      this.ng.ping(),
      this.ng.listSessions(),
      Promise.resolve(this.nodes.listNodes()),
      this.media.listRtpSessions({ tenantId, limit: 200 }),
    ]);

    return {
      ping,
      ngList: list.sessions ?? null,
      ngError: list.error,
      nodes: nodeList,
      activeSessions: sessions,
      sessionCount: sessions.length,
      ports: sessions.map((s) => s.rtpSessionId).filter(Boolean),
      transcoding: sessions.filter((s) => s.transcoding).length,
      srtpSessions: sessions.filter((s) => s.srtp || s['SRTP']).length,
    };
  }
}
