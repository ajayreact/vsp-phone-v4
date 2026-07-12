import { Injectable } from '@nestjs/common';
import { CallLifecycleState, CarrierType, DeviceStatus, PhoneNumberStatus } from '@prisma/client';
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

    const activeCalls = this.prisma.connected
      ? await this.prisma.callSession.count({
          where: { ...tenantFilter, deletedAt: null, state: { in: activeStates } },
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

    const registeredExtensions = this.prisma.connected
      ? await this.prisma.extension.count({
          where: { ...tenantFilter, deletedAt: null, line: { devices: { some: { deletedAt: null, status: { in: [DeviceStatus.REGISTERED, DeviceStatus.ONLINE, DeviceStatus.BUSY] } } } } },
        })
      : 0;

    const telnyxInventory = this.prisma.connected
      ? await this.prisma.phoneNumber.count({
          where: {
            ...tenantFilter,
            deletedAt: null,
            carrier: { carrierType: CarrierType.TELNYX, deletedAt: null },
          },
        })
      : 0;

    const assignedDids = this.prisma.connected
      ? await this.prisma.phoneNumber.count({
          where: {
            ...tenantFilter,
            deletedAt: null,
            lineId: { not: null },
            status: PhoneNumberStatus.ACTIVE,
          },
        })
      : 0;

    const unassignedDids = this.prisma.connected
      ? await this.prisma.phoneNumber.count({
          where: {
            ...tenantFilter,
            deletedAt: null,
            lineId: null,
            status: PhoneNumberStatus.ACTIVE,
          },
        })
      : 0;

    const failedCallsToday = this.prisma.connected
      ? await this.prisma.callSession.count({
          where: {
            ...tenantFilter,
            deletedAt: null,
            state: CallLifecycleState.ENDED,
            startedAt: { gte: todayStart },
            endedAt: { not: null },
            // Treat short/abandoned as failed heuristic when disposition not stored
          },
        })
      : 0;

    const sipRegistrations = registeredDevices;

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

    let onboarding = null;
    if (tenantId && this.prisma.connected) {
      const [userCount, extensionCount, deviceCount, ivrCount, timeConditionCount, settings] =
        await Promise.all([
          this.prisma.user.count({ where: { tenantId, deletedAt: null } }),
          this.prisma.extension.count({ where: { tenantId, deletedAt: null } }),
          this.prisma.device.count({ where: { tenantId, deletedAt: null } }),
          this.prisma.iVR.count({ where: { tenantId, deletedAt: null } }),
          this.prisma.timeCondition.count({ where: { tenantId, deletedAt: null } }),
          this.prisma.tenantSettings.findFirst({ where: { tenantId } }),
        ]);

      const checklist = [
        { id: 'company', label: 'Company Profile', done: Boolean(settings?.businessEmail || settings?.logoUrl) },
        { id: 'user', label: 'First User', done: userCount > 0 },
        { id: 'extension', label: 'First Extension', done: extensionCount > 0 },
        { id: 'device', label: 'First Device', done: deviceCount > 0 },
        { id: 'did', label: 'First DID', done: assignedDids > 0 },
        { id: 'hours', label: 'Business Hours', done: timeConditionCount > 0 },
        { id: 'ivr', label: 'IVR', done: ivrCount > 0 },
      ];
      const completed = checklist.filter((c) => c.done).length;
      onboarding = {
        checklist,
        completed,
        total: checklist.length,
        percent: Math.round((completed / checklist.length) * 100),
      };
    }

    const infra = await this.health.checkAll();

    const dashboardKey = tenantId
      ? this.redis.dashboardSnapshotKey(tenantId)
      : 'vsp:global:dashboard:snapshot';
    const snapshot = {
      ts: new Date().toISOString(),
      tenantId: tenantId ?? 'global',
      activeCalls,
      concurrentCalls: activeCalls,
      registeredDevices,
      registeredExtensions,
      telnyxInventory,
      assignedDids,
      unassignedDids,
      availableDids: unassignedDids,
      sipRegistrations,
      failedCallsToday,
      activeConferences,
      activeQueues,
      queueWaiting: activeQueues,
      onlineTenants,
      onboarding,
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
