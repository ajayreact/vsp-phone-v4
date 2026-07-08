import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { QUEUE_EVENTS, type QueueEventPayload } from './queue.events';

@Injectable()
export class QueueEventsListener {
  private readonly logger = new Logger(QueueEventsListener.name);

  @OnEvent(QUEUE_EVENTS.ENTERED)
  @OnEvent(QUEUE_EVENTS.AGENT_OFFERED)
  @OnEvent(QUEUE_EVENTS.OVERFLOW)
  @OnEvent(QUEUE_EVENTS.TIMEOUT)
  @OnEvent(QUEUE_EVENTS.ANNOUNCEMENT)
  onQueueEvent(payload: QueueEventPayload): void {
    this.logger.log(JSON.stringify({ event: 'queue.listener', ...payload }));
  }
}
