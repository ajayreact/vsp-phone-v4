import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BLF_EVENTS, type BlfEventPayload } from '../events/blf.events';

@Injectable()
export class BlfEventsListener {
  private readonly logger = new Logger(BlfEventsListener.name);

  @OnEvent(BLF_EVENTS.LAMP_CHANGED)
  @OnEvent(BLF_EVENTS.SUBSCRIBED)
  onBlf(payload: BlfEventPayload): void {
    this.logger.log(JSON.stringify({ event: 'blf.listener', ...payload }));
  }
}
