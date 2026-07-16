import { Injectable } from '@nestjs/common';
import {
  CallLifecycleState,
  CarrierType,
  DeviceStatus,
  NumberReservationStatus,
  PhoneNumberStatus,
  TenantStatus,
} from '@prisma/client';
import {
  EnterpriseHealthService,
  type HealthCheckResult,
} from '../../enterprise-observability/health/enterprise-health.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';

const BYTES_PER_RECORDING_SECOND = 8000;

export type PlatformDashboardComponents = {
  api: HealthCheckResult;
  postgres: HealthCheckResult;
  redis: HealthCheckResult;
  kamailio: HealthCheckResult;
  rtpengine: HealthCheckResult;
};

export type PlatformDashboardSnapshot = {
  ts: string;
  totalTenants: number;
  activeTenants: number;
  pendingTenantApprovals: number;
  /** Kept for backward compatibility; not shown on Platform Dashboard. */
  totalExtensions: number;
  registeredDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  concurrentCalls: number;
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
  carrierStatus: Awaited<ReturnType<EnterpriseHealthService['checkTelnyx']>>;
  components: PlatformDashboardComponents;
  activeAlerts: number;
};

@Injectable()
export class PlatformDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: EnterpriseHealthService,
  ) {}

  async snapshot(): Promise<PlatformDashboardSnapshot> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
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

    const [
      totalTenants,
      activeTenants,
      pendingTenantApprovals,
      totalExtensions,
      registeredDevices,
      onlineDevices,
      offlineDevices,
      concurrentCalls,
      totalPurchasedDids,
      telnyxInventory,
      assignedDids,
      unassignedDids,
      reservedDids,
      failedCallsToday,
      todaysCallMinutes,
      billingAgg,
      recordingAgg,
      healthAll,
    ] = await Promise.all([
      connected ? this.prisma.tenant.count({ where: { deletedAt: null } }) : Promise.resolve(0),
      connected
        ? this.prisma.tenant.count({
            where: { deletedAt: null, status: TenantStatus.ACTIVE },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.tenant.count({
            where: { deletedAt: null, status: TenantStatus.PENDING },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.extension.count({ where: { deletedAt: null } })
        : Promise.resolve(0),
      connected
        ? this.prisma.device.count({
            where: {
              deletedAt: null,
              status: { in: [DeviceStatus.REGISTERED, DeviceStatus.ONLINE, DeviceStatus.BUSY] },
            },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.device.count({
            where: {
              deletedAt: null,
              status: { in: [DeviceStatus.ONLINE, DeviceStatus.REGISTERED, DeviceStatus.BUSY] },
            },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.device.count({
            where: {
              deletedAt: null,
              status: { in: [DeviceStatus.OFFLINE, DeviceStatus.UNREGISTERED] },
            },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.callSession.count({
            where: { deletedAt: null, state: { in: activeStates } },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.phoneNumber.count({ where: { deletedAt: null } })
        : Promise.resolve(0),
      connected
        ? this.prisma.phoneNumber.count({
            where: {
              deletedAt: null,
              carrier: { carrierType: CarrierType.TELNYX, deletedAt: null },
            },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.phoneNumber.count({
            where: {
              deletedAt: null,
              lineId: { not: null },
              status: PhoneNumberStatus.ACTIVE,
            },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.phoneNumber.count({
            where: {
              deletedAt: null,
              lineId: null,
              status: PhoneNumberStatus.ACTIVE,
            },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.numberReservation.count({
            where: { status: NumberReservationStatus.ACTIVE },
          })
        : Promise.resolve(0),
      connected
        ? this.prisma.callSession.count({
            where: {
              deletedAt: null,
              state: CallLifecycleState.ENDED,
              startedAt: { gte: todayStart },
              endedAt: { not: null },
            },
          })
        : Promise.resolve(0),
      connected ? this.sumTodaysCallMinutes(todayStart) : Promise.resolve(0),
      connected
        ? this.prisma.billingAccount.aggregate({
            _sum: { mrrCents: true, carrierCostCents: true },
          })
        : Promise.resolve({ _sum: { mrrCents: null, carrierCostCents: null } }),
      connected
        ? this.prisma.recording.aggregate({
            where: { deletedAt: null },
            _count: true,
            _sum: { durationSeconds: true },
          })
        : Promise.resolve({ _count: 0, _sum: { durationSeconds: null } }),
      this.health.checkAll(),
    ]);

    const mrrCents = billingAgg._sum.mrrCents ?? 0;
    const carrierCostCents = billingAgg._sum.carrierCostCents ?? 0;
    const grossMarginCents = mrrCents - carrierCostCents;
    const recordingCount = recordingAgg._count;
    const storageBytesEstimate =
      (recordingAgg._sum.durationSeconds ?? 0) * BYTES_PER_RECORDING_SECOND;

    const components: PlatformDashboardComponents = {
      api: healthAll.api,
      postgres: healthAll.postgres,
      redis: healthAll.redis,
      kamailio: healthAll.kamailio,
      rtpengine: healthAll.rtpengine,
    };

    return {
      ts,
      totalTenants,
      activeTenants,
      pendingTenantApprovals,
      totalExtensions,
      registeredDevices,
      onlineDevices,
      offlineDevices,
      concurrentCalls,
      sipRegistrations: registeredDevices,
      totalPurchasedDids,
      telnyxInventory,
      assignedDids,
      unassignedDids,
      reservedDids,
      failedCallsToday,
      todaysCallMinutes,
      mrrCents,
      carrierCostCents,
      grossMarginCents,
      recordingCount,
      storageBytesEstimate,
      carrierStatus: healthAll.telnyx,
      components,
      activeAlerts: 0,
    };
  }

  /** Sum answered (or started) call duration for sessions that ended today, in whole minutes. */
  private async sumTodaysCallMinutes(todayStart: Date): Promise<number> {
    const sessions = await this.prisma.callSession.findMany({
      where: {
        deletedAt: null,
        state: { in: [CallLifecycleState.ENDED, CallLifecycleState.ARCHIVED] },
        endedAt: { gte: todayStart, not: null },
      },
      select: {
        answeredAt: true,
        startedAt: true,
        endedAt: true,
      },
    });

    let totalSeconds = 0;
    for (const s of sessions) {
      if (!s.endedAt) continue;
      const start = s.answeredAt ?? s.startedAt;
      if (!start) continue;
      const seconds = Math.max(0, Math.floor((s.endedAt.getTime() - start.getTime()) / 1000));
      totalSeconds += seconds;
    }
    return Math.floor(totalSeconds / 60);
  }
}
