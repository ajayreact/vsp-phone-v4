import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PARK_PICKUP_EVENTS, type ParkEventPayload, type PickupEventPayload } from '../events/park-pickup.events';
import { SUPERVISOR_EVENTS, type SupervisorEventPayload } from '../events/supervisor.events';

@Injectable()
export class EnterpriseOpsEventsListener {
  private readonly logger = new Logger(EnterpriseOpsEventsListener.name);

  @OnEvent(PARK_PICKUP_EVENTS.PARKED)
  @OnEvent(PARK_PICKUP_EVENTS.RETRIEVED)
  onPark(payload: ParkEventPayload): void {
    this.logger.log(JSON.stringify({ event: 'park.listener', ...payload }));
  }

  @OnEvent(PARK_PICKUP_EVENTS.PICKUP_OFFERED)
  @OnEvent(PARK_PICKUP_EVENTS.PICKUP_ANSWERED)
  onPickup(payload: PickupEventPayload): void {
    this.logger.log(JSON.stringify({ event: 'pickup.listener', ...payload }));
  }

  @OnEvent(SUPERVISOR_EVENTS.MONITOR_STARTED)
  @OnEvent(SUPERVISOR_EVENTS.WHISPER_STARTED)
  @OnEvent(SUPERVISOR_EVENTS.BARGE_STARTED)
  onSupervisor(payload: SupervisorEventPayload): void {
    this.logger.log(JSON.stringify({ event: 'supervisor.listener', ...payload }));
  }
}
