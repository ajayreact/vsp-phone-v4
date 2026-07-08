import { Injectable } from '@nestjs/common';
import { CallLifecycleState, DeviceStatus } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { EnterpriseHealthService } from '../health/enterprise-health.service';

/** Phase 15 — read-only live operations dashboard aggregates. */
@Injectable()
export class OperationsDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly health: EnterpriseHealthService,
  ) {}

  async snapshot(tenantId?: string): Promise<Record<string, unknown>> {
    const tenantFilter = tenantId ? { tenantId } : {};

    const activeCalls = this.prisma.connected
      ? await this.prisma.callSession.count({
          where: {
            ...tenantFilter,
            deletedAt: null,
            state: {
              in: [
                CallLifecycleState.DIALING,
                CallLifecycleState.RINGING,
                CallLifecycleState.ANSWERED,
                CallLifecycleState.ACTIVE,
                CallLifecycleState.HOLD,
                CallLifecycleState.PARK,
              ],
            },
          },
        })
      : 0;

    const registeredDevices = this.prisma.connected
      ? await this.prisma.device.count({
          where: {
            ...tenantFilter,
            deletedAt: null,
            status: { in: [DeviceStatus.REGISTERED, DeviceStatus.ONLINE, DeviceStatus.BUSY] },
          },
        })
      : 0;

    const activeConferences = this.prisma.connected
      ? await this.prisma.callSession.count({
          where: {
            ...tenantFilter,
            deletedAt: null,
            conferenceId: { not: null },
            state: { in: [CallLifecycleState.ACTIVE, CallLifecycleState.ANSWERED] },
          },
        })
      : 0;

    const activeQueues = this.prisma.connected
      ? await this.prisma.callSession.count({
          where: {
            ...tenantFilter,
            deletedAt: null,
            queueId: { not: null },
            state: { in: [CallLifecycleState.RINGING, CallLifecycleState.ACTIVE, CallLifecycleState.HOLD] },
          },
        })
      : 0;

    const onlineTenants = this.prisma.connected
      ? await this.prisma.tenant.count({ where: { deletedAt: null, status: 'ACTIVE' } })
      : 0;

    const infra = await this.health.checkAll();

    const dashboardKey = tenantId
      ? this.redis.dashboardSnapshotKey(tenantId)
      : 'vsp:global:dashboard:snapshot';
    const snapshot = {
      ts: new Date().toISOString(),
      tenantId: tenantId ?? 'global',
      activeCalls,
      registeredDevices,
      activeConferences,
      activeQueues,
      onlineTenants,
      redis: { available: this.redis.isAvailable() },
      postgres: { connected: this.prisma.connected },
      infrastructure: infra,
    };

    if (tenantId) {
      await this.redis.setex(dashboardKey, 60, JSON.stringify(snapshot));
    }

    return snapshot;
  }
}
