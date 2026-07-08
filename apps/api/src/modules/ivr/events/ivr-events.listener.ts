import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IVR_EVENTS, type IvrEventPayload } from './ivr.events';

@Injectable()
export class IvrEventsListener {
  private readonly logger = new Logger(IvrEventsListener.name);

  @OnEvent(IVR_EVENTS.DIGIT)
  @OnEvent(IVR_EVENTS.STARTED)
  @OnEvent(IVR_EVENTS.PROMPT_PLAYED)
  onIvr(payload: IvrEventPayload): void {
    this.logger.log(JSON.stringify({ event: 'ivr.listener', ...payload }));
  }
}
