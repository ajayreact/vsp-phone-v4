import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  REGISTRATION_EVENTS,
  type RegistrationAuthFailedPayload,
  type RegistrationCreatedPayload,
  type RegistrationRemovedPayload,
} from './registration.events';

/**
 * Phase 6 registration event subscriber — structured log sink.
 * Future: outbox / metrics / webhooks. No CallSession side effects.
 */
@Injectable()
export class RegistrationEventsListener {
  private readonly logger = new Logger(RegistrationEventsListener.name);

  @OnEvent(REGISTRATION_EVENTS.CREATED)
  onCreated(payload: RegistrationCreatedPayload): void {
    this.logLifecycle(payload);
  }

  @OnEvent(REGISTRATION_EVENTS.REFRESHED)
  onRefreshed(payload: RegistrationCreatedPayload): void {
    this.logLifecycle(payload);
  }

  @OnEvent(REGISTRATION_EVENTS.UNREGISTERED)
  onUnregistered(payload: RegistrationRemovedPayload): void {
    this.logRemoved(payload);
  }

  @OnEvent(REGISTRATION_EVENTS.EXPIRED)
  onExpired(payload: RegistrationRemovedPayload): void {
    this.logRemoved(payload);
  }

  @OnEvent(REGISTRATION_EVENTS.AUTH_FAILED)
  onAuthFailed(payload: RegistrationAuthFailedPayload): void {
    this.logger.warn(
      JSON.stringify({
        event: payload.type,
        eventId: payload.eventId,
        username: payload.username,
        reason: payload.reason,
        srcIp: payload.srcIp,
      }),
    );
  }

  private logLifecycle(payload: RegistrationCreatedPayload): void {
    this.logger.log(
      JSON.stringify({
        event: payload.type,
        eventId: payload.eventId,
        tenantId: payload.tenantId,
        deviceId: payload.deviceId,
        aor: payload.aor,
        multiDeviceCount: payload.multiDeviceCount,
      }),
    );
  }

  private logRemoved(payload: RegistrationRemovedPayload): void {
    this.logger.log(
      JSON.stringify({
        event: payload.type,
        eventId: payload.eventId,
        tenantId: payload.tenantId,
        deviceId: payload.deviceId,
        aor: payload.aor,
        reason: payload.reason,
      }),
    );
  }
}
