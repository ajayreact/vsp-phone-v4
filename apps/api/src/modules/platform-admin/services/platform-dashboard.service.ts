import { Injectable } from '@nestjs/common';
import {
  CallLifecycleState,
  CarrierType,
  DeviceStatus,
  PhoneNumberStatus,
} from '@prisma/client';
import { EnterpriseHealthService } from '../../enterprise-observability/health/enterprise-health.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';

const BYTES_PER_RECORDING_SECOND = 8000;

export type PlatformDashboardSnapshot = {
  ts: string;
  totalTenants: number;
  totalExtensions: number;
  registeredDevices: number;
  concurrentCalls: number;
  sipRegistrations: number;
  telnyxInventory: number;
  assignedDids: number;
  unassignedDids: number;
  failedCallsToday: number;
  mrrCents: number;
  carrierCostCents: number;
  grossMarginCents: number;
  recordingCount: number;
  storageBytesEstimate: number;
  carrierStatus: Awaited<ReturnType<EnterpriseHealthService['checkTelnyx']>>;
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

    const activeStates = [
      CallLifecycleState.DIALING,
      CallLifecycleState.RINGING,
      CallLifecycleState.ANSWERED,
      CallLifecycleState.ACTIVE,
      CallLifecycleState.HOLD,
      CallLifecycleState.PARK,
    ];

    const connected = this.prisma.connected;

    const totalTenants = connected
      ? await this.prisma.tenant.count({ where: { deletedAt: null } })
      : 0;

    const totalExtensions = connected
      ? await this.prisma.extension.count({ where: { deletedAt: null } })
      : 0;

    const registeredDevices = connected
      ? await this.prisma.device.count({
          where: {
            deletedAt: null,
            status: { in: [DeviceStatus.REGISTERED, DeviceStatus.ONLINE, DeviceStatus.BUSY] },
          },
        })
      : 0;

    const concurrentCalls = connected
      ? await this.prisma.callSession.count({
          where: { deletedAt: null, state: { in: activeStates } },
        })
      : 0;

    const sipRegistrations = registeredDevices;

    const telnyxInventory = connected
      ? await this.prisma.phoneNumber.count({
          where: {
            deletedAt: null,
            carrier: { carrierType: CarrierType.TELNYX, deletedAt: null },
          },
        })
      : 0;

    const assignedDids = connected
      ? await this.prisma.phoneNumber.count({
          where: {
            deletedAt: null,
            lineId: { not: null },
            status: PhoneNumberStatus.ACTIVE,
          },
        })
      : 0;

    const unassignedDids = connected
      ? await this.prisma.phoneNumber.count({
          where: {
            deletedAt: null,
            lineId: null,
            status: PhoneNumberStatus.ACTIVE,
          },
        })
      : 0;

    const failedCallsToday = connected
      ? await this.prisma.callSession.count({
          where: {
            deletedAt: null,
            state: CallLifecycleState.ENDED,
            startedAt: { gte: todayStart },
            endedAt: { not: null },
          },
        })
      : 0;

    const billingAgg = connected
      ? await this.prisma.billingAccount.aggregate({
          _sum: { mrrCents: true, carrierCostCents: true },
        })
      : { _sum: { mrrCents: null, carrierCostCents: null } };

    const mrrCents = billingAgg._sum.mrrCents ?? 0;
    const carrierCostCents = billingAgg._sum.carrierCostCents ?? 0;
    const grossMarginCents = mrrCents - carrierCostCents;

    const recordingAgg = connected
      ? await this.prisma.recording.aggregate({
          where: { deletedAt: null },
          _count: true,
          _sum: { durationSeconds: true },
        })
      : { _count: 0, _sum: { durationSeconds: null } };

    const recordingCount = recordingAgg._count;
    const storageBytesEstimate =
      (recordingAgg._sum.durationSeconds ?? 0) * BYTES_PER_RECORDING_SECOND;

    const carrierStatus = await this.health.checkTelnyx();

    return {
      ts: new Date().toISOString(),
      totalTenants,
      totalExtensions,
      registeredDevices,
      concurrentCalls,
      sipRegistrations,
      telnyxInventory,
      assignedDids,
      unassignedDids,
      failedCallsToday,
      mrrCents,
      carrierCostCents,
      grossMarginCents,
      recordingCount,
      storageBytesEstimate,
      carrierStatus,
      activeAlerts: 0,
    };
  }
}
