import { Injectable } from '@nestjs/common';
import os from 'node:os';
import { KamailioNodeRegistryService } from '../../enterprise-ha/failover/kamailio-node-registry.service';
import { RtpengineNodeRegistryService } from '../../enterprise-ha/failover/rtpengine-node-registry.service';
import { OperationsDashboardService } from '../../enterprise-observability/dashboard/operations-dashboard.service';
import { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import { MetricsService } from '../../enterprise-observability/metrics/metrics.service';
import { ObjectStorageService } from '../../recording/storage/object-storage.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { DeviceStatus, DeviceType, SIPEndpointStatus } from '@prisma/client';

/** Phase 2E — enriched NOC platform dashboard. */
@Injectable()
export class OpsNocDashboardService {
  constructor(
    private readonly dashboard: OperationsDashboardService,
    private readonly health: EnterpriseHealthService,
    private readonly prisma: PrismaService,
    private readonly kamailioNodes: KamailioNodeRegistryService,
    private readonly rtpengineNodes: RtpengineNodeRegistryService,
    private readonly metrics: MetricsService,
    private readonly storage: ObjectStorageService,
  ) {}

  async getPlatformDashboard(tenantId?: string) {
    const minio = await this.storage.healthCheck();
    const [base, infra, host, webrtcClients, sipPhones, dispatcher] = await Promise.all([
      this.dashboard.snapshot(tenantId),
      this.health.checkAllExtended(minio),
      this.getHostMetrics(),
      this.countWebrtcClients(tenantId),
      this.countSipPhones(tenantId),
      this.getDispatcherStatus(),
    ]);

    await this.metrics.refreshGauges();

    return {
      ...base,
      platformStatus: this.derivePlatformStatus(infra),
      concurrentCalls: base.concurrentCalls ?? base.activeCalls,
      registeredSipPhones: sipPhones,
      registeredWebrtcClients: webrtcClients,
      kamailioStatus: infra.kamailio,
      dispatcherStatus: dispatcher,
      rtpengineStatus: infra.rtpengine,
      redis: infra.redis,
      postgres: infra.postgres,
      minio: infra.minio,
      api: infra.api,
      host,
      infrastructure: infra,
      kamailioNodes: this.kamailioNodes.listNodes(),
      rtpengineNodes: this.rtpengineNodes.listNodes(),
    };
  }

  private derivePlatformStatus(infra: Record<string, { status: string }>): string {
    const statuses = Object.values(infra).map((c) => c.status);
    if (statuses.every((s) => s === 'up')) return 'healthy';
    if (statuses.some((s) => s === 'down')) return 'critical';
    return 'degraded';
  }

  private getHostMetrics() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const load = os.loadavg();
    return {
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model ?? 'unknown',
      loadAvg1m: Math.round(load[0] * 100) / 100,
      loadAvg5m: Math.round(load[1] * 100) / 100,
      loadAvg15m: Math.round(load[2] * 100) / 100,
      memoryTotalBytes: totalMem,
      memoryFreeBytes: freeMem,
      memoryUsedPct: Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10,
      uptimeSec: Math.floor(os.uptime()),
      platform: os.platform(),
      hostname: os.hostname(),
    };
  }

  private async countWebrtcClients(tenantId?: string) {
    if (!this.prisma.connected) return 0;
    return this.prisma.device.count({
      where: {
        ...(tenantId ? { tenantId } : {}),
        deletedAt: null,
        deviceType: DeviceType.WEBRTC,
        status: { in: [DeviceStatus.REGISTERED, DeviceStatus.ONLINE, DeviceStatus.BUSY] },
      },
    });
  }

  private async countSipPhones(tenantId?: string) {
    if (!this.prisma.connected) return 0;
    return this.prisma.sIPEndpoint.count({
      where: {
        ...(tenantId ? { tenantId } : {}),
        deletedAt: null,
        registrationStatus: SIPEndpointStatus.REGISTERED,
      },
    });
  }

  private async getDispatcherStatus() {
    const nodes = this.kamailioNodes.listNodes();
    const up = nodes.filter((n) => n.status === 'up').length;
    return {
      status: up > 0 ? 'up' : nodes.length ? 'degraded' : 'unknown',
      nodesTotal: nodes.length,
      nodesUp: up,
    };
  }
}
