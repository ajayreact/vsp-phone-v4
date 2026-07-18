import { Injectable } from '@nestjs/common';
import {
  CallLifecycleState,
  DeviceStatus,
  TenantStatus,
} from '@prisma/client';
import {
  EnterpriseHealthService,
  type HealthCheckResult,
} from '../../enterprise-observability/health/enterprise-health.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type PlatformDashboardComponents = Record<string, HealthCheckResult>;

export type PlatformDashboardSnapshot = {
  ts: string;
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  totalExtensions: number;
  totalDevices: number;
  totalNumbers: number;
  concurrentCalls: number;
  /** Active call channels (same as concurrent for RC1). */
  channels: number;
  healthStatus: 'up' | 'degraded' | 'down';
  components: PlatformDashboardComponents;
  // Backward-compatible fields retained for older clients
  pendingTenantApprovals: number;
  registeredDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  sipRegistrations: number;
  totalPurchasedDids: number;
  telnyxInventory: number;
  assignedDids: number;
  unassignedDids: number;
  reservedDids: number;
  failedCallsToday: number;
  todaysCallMinutes: number;
  mrrCents: number;
  carrierCostCents: number;
  grossMarginCents: number;
  recordingCount: number;
  storageBytesEstimate: number;
  carrierStatus: HealthCheckResult;
  activeAlerts: number;
};

@Injectable()
export class PlatformDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: EnterpriseHealthService,
  ) {}

  async snapshot(): Promise<PlatformDashboardSnapshot> {
    const ts = new Date().toISOString();
    const activeStates = [
      CallLifecycleState.DIALING,
      CallLifecycleState.RINGING,
      CallLifecycleState.ANSWERED,
      CallLifecycleState.ACTIVE,
      CallLifecycleState.HOLD,
      CallLifecycleState.PARK,
    ];
    const connected = this.prisma.connected;
    const systemSlugFilter = { notIn: ['platform-inventory', 'inventory'] };

    const [
      totalTenants,
      activeTenants,
      totalUsers,
      totalExtensions,
      totalDevices,
      totalNumbers,
      concurrentCalls,
      healthAll,
    ] = await Promise.all([
      connected
        ? this.prisma.tenant.count({ where: { deletedAt: null, slug: systemSlugFilter } })
        : Promise.resolve(0),
      connected
        ? this.prisma.tenant.count({
            where: { deletedAt: null, status: TenantStatus.ACTIVE, slug: systemSlugFilter },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.user.count({
            where: {
              deletedAt: null,
              tenant: { deletedAt: null, slug: systemSlugFilter },
            },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.extension.count({
            where: {
              deletedAt: null,
              tenant: { deletedAt: null, slug: systemSlugFilter },
            },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.device.count({
            where: {
              deletedAt: null,
              tenant: { deletedAt: null, slug: systemSlugFilter },
            },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.phoneNumber.count({ where: { deletedAt: null } })
        : Promise.resolve(0),
      connected
        ? this.prisma.callSession.count({
            where: { deletedAt: null, state: { in: activeStates } },
          })
        : Promise.resolve(0),
      this.health.checkAll(),
    ]);

    const registeredDevices = connected
      ? await this.prisma.device.count({
          where: {
            deletedAt: null,
            status: { in: [DeviceStatus.REGISTERED, DeviceStatus.ONLINE, DeviceStatus.BUSY] },
          },
        })
      : 0;

    const core = [healthAll.api, healthAll.database ?? healthAll.postgres, healthAll.redis];
    const healthStatus: 'up' | 'degraded' | 'down' = core.some((c) => c?.status === 'down')
      ? 'down'
      : core.some((c) => c?.status === 'degraded')
        ? 'degraded'
        : 'up';

    return {
      ts,
      totalTenants,
      activeTenants,
      totalUsers,
      totalExtensions,
      totalDevices,
      totalNumbers,
      concurrentCalls,
      channels: concurrentCalls,
      healthStatus,
      components: healthAll,
      pendingTenantApprovals: 0,
      registeredDevices,
      onlineDevices: registeredDevices,
      offlineDevices: Math.max(0, totalDevices - registeredDevices),
      sipRegistrations: registeredDevices,
      totalPurchasedDids: totalNumbers,
      telnyxInventory: totalNumbers,
      assignedDids: 0,
      unassignedDids: 0,
      reservedDids: 0,
      failedCallsToday: 0,
      todaysCallMinutes: 0,
      mrrCents: 0,
      carrierCostCents: 0,
      grossMarginCents: 0,
      recordingCount: 0,
      storageBytesEstimate: 0,
      carrierStatus: healthAll.carrier ?? healthAll.telnyx,
      activeAlerts: 0,
    };
  }
}
