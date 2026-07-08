import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PresenceStatus } from '@prisma/client';
import {
  CALL_EVENTS,
  type CallLifecyclePayload,
} from '../../telecom/events/call.events';
import {
  REGISTRATION_EVENTS,
  type RegistrationCreatedPayload,
  type RegistrationRemovedPayload,
} from '../../telecom/events/registration.events';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { PRESENCE_EVENTS, type PresenceChangedPayload } from '../events/presence.events';
import { DevicePresenceService } from '../device-presence.service';
import { PresenceService } from '../presence.service';

/** Phase 12 — registration + call state → presence transitions. */
@Injectable()
export class PresenceEventsListener {
  private readonly logger = new Logger(PresenceEventsListener.name);

  constructor(
    private readonly presence: PresenceService,
    private readonly devicePresence: DevicePresenceService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(REGISTRATION_EVENTS.CREATED)
  @OnEvent(REGISTRATION_EVENTS.REFRESHED)
  async onRegistration(payload: RegistrationCreatedPayload): Promise<void> {
    await this.devicePresence.syncFromRegistration({
      tenantId: payload.tenantId,
      deviceId: payload.deviceId,
      lineId: payload.lineId,
      registered: true,
    });
  }

  @OnEvent(REGISTRATION_EVENTS.UNREGISTERED)
  @OnEvent(REGISTRATION_EVENTS.EXPIRED)
  async onUnregister(payload: RegistrationRemovedPayload): Promise<void> {
    if (!payload.deviceId) return;
    const device = await this.prisma.device.findFirst({
      where: { id: payload.deviceId, tenantId: payload.tenantId, deletedAt: null },
      select: { lineId: true, status: true },
    });
    if (!device?.lineId) return;
    const stillRegistered = await this.prisma.device.count({
      where: {
        tenantId: payload.tenantId,
        lineId: device.lineId,
        deletedAt: null,
        status: { in: ['REGISTERED', 'ONLINE', 'BUSY'] },
        id: { not: payload.deviceId },
      },
    });
    if (stillRegistered === 0) {
      await this.presence.setLinePresence({
        tenantId: payload.tenantId,
        lineId: device.lineId,
        deviceId: payload.deviceId,
        status: PresenceStatus.OFFLINE,
        source: 'registration',
      });
    }
  }

  @OnEvent(CALL_EVENTS.RINGING)
  async onRinging(payload: CallLifecyclePayload): Promise<void> {
    const session = await this.loadSession(payload);
    if (!session?.toLineId) return;
    await this.presence.setLinePresence({
      tenantId: session.tenantId,
      lineId: session.toLineId,
      status: PresenceStatus.BUSY,
      source: 'call',
      platformUuid: payload.platformUuid,
    });
  }

  @OnEvent(CALL_EVENTS.ANSWERED)
  async onAnswered(payload: CallLifecyclePayload): Promise<void> {
    const session = await this.loadSession(payload);
    if (!session) return;
    for (const lineId of [session.fromLineId, session.toLineId].filter(Boolean) as string[]) {
      await this.devicePresence.syncFromCall({
        tenantId: session.tenantId,
        lineId,
        onCall: true,
        platformUuid: payload.platformUuid,
      });
    }
  }

  @OnEvent(CALL_EVENTS.ENDED)
  @OnEvent(CALL_EVENTS.REJECTED)
  async onCallEnded(payload: CallLifecyclePayload): Promise<void> {
    const session = await this.loadSession(payload);
    if (!session) return;
    for (const lineId of [session.fromLineId, session.toLineId].filter(Boolean) as string[]) {
      await this.devicePresence.syncFromCall({
        tenantId: session.tenantId,
        lineId,
        onCall: false,
        platformUuid: payload.platformUuid,
      });
    }
  }

  @OnEvent(PRESENCE_EVENTS.CHANGED)
  onPresenceChanged(payload: PresenceChangedPayload): void {
    this.logger.log(JSON.stringify({ event: 'presence.listener', ...payload }));
  }

  private async loadSession(payload: CallLifecyclePayload) {
    if (!this.prisma.connected) return null;
    if (payload.callSessionId) {
      return this.prisma.callSession.findFirst({
        where: { id: payload.callSessionId, deletedAt: null },
        select: { tenantId: true, fromLineId: true, toLineId: true },
      });
    }
    return this.prisma.callSession.findFirst({
      where: { platformUuid: payload.platformUuid, deletedAt: null },
      select: { tenantId: true, fromLineId: true, toLineId: true },
    });
  }
}
