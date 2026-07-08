import { Injectable } from '@nestjs/common';
import { DeviceStatus, PresenceStatus } from '@prisma/client';
import { PrismaService } from '../telecom/prisma/prisma.service';
import { PresenceService } from './presence.service';

/** Phase 12 — per-device presence mirror for multi-device aggregation. */
@Injectable()
export class DevicePresenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async syncFromRegistration(params: {
    tenantId: string;
    deviceId: string;
    lineId?: string;
    registered: boolean;
  }): Promise<void> {
    if (!params.lineId) {
      const device = await this.prisma.device.findFirst({
        where: { id: params.deviceId, tenantId: params.tenantId, deletedAt: null },
        select: { lineId: true },
      });
      if (!device?.lineId) return;
      params.lineId = device.lineId;
    }

    const status = params.registered ? PresenceStatus.AVAILABLE : PresenceStatus.OFFLINE;
    await this.presence.setLinePresence({
      tenantId: params.tenantId,
      lineId: params.lineId,
      deviceId: params.deviceId,
      status,
      source: 'registration',
    });

    if (params.registered) {
      await this.prisma.device.update({
        where: { id: params.deviceId },
        data: { status: DeviceStatus.ONLINE },
      });
    }
  }

  async syncFromCall(params: {
    tenantId: string;
    lineId: string;
    deviceId?: string;
    onCall: boolean;
    platformUuid?: string;
  }): Promise<void> {
    if (params.onCall) {
      await this.presence.pushPriorStatus(params.tenantId, params.lineId, PresenceStatus.AVAILABLE);
      await this.presence.setLinePresence({
        tenantId: params.tenantId,
        lineId: params.lineId,
        deviceId: params.deviceId,
        status: PresenceStatus.ON_CALL,
        source: 'call',
        platformUuid: params.platformUuid,
      });
      if (params.deviceId) {
        await this.prisma.device.update({
          where: { id: params.deviceId },
          data: { status: DeviceStatus.BUSY },
        });
      }
      return;
    }
    await this.presence.restorePriorStatus(params.tenantId, params.lineId, params.deviceId);
    if (params.deviceId) {
      await this.prisma.device.update({
        where: { id: params.deviceId },
        data: { status: DeviceStatus.REGISTERED },
      });
    }
  }
}
