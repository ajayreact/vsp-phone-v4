import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  CALL_EVENTS,
  type CallCreatedPayload,
  type CallLifecyclePayload,
} from './call.events';

@Injectable()
export class CallEventsListener {
  private readonly logger = new Logger(CallEventsListener.name);

  @OnEvent(CALL_EVENTS.CREATED)
  onCreated(payload: CallCreatedPayload): void {
    this.logger.log(
      JSON.stringify({
        event: payload.type,
        eventId: payload.eventId,
        tenantId: payload.tenantId,
        platformUuid: payload.platformUuid,
        callSessionId: payload.callSessionId,
        callIntent: payload.callIntent,
        forkCount: payload.forkCount,
      }),
    );
  }

  @OnEvent(CALL_EVENTS.RINGING)
  @OnEvent(CALL_EVENTS.ANSWERED)
  @OnEvent(CALL_EVENTS.ENDED)
  @OnEvent(CALL_EVENTS.REJECTED)
  onLifecycle(payload: CallLifecyclePayload): void {
    this.logger.log(
      JSON.stringify({
        event: payload.type,
        eventId: payload.eventId,
        tenantId: payload.tenantId,
        platformUuid: payload.platformUuid,
        callSessionId: payload.callSessionId,
        state: payload.state,
        cause: payload.cause,
      }),
    );
  }
}
