import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CONFERENCE_EVENTS, type ConferenceEventPayload } from './conference.events';

@Injectable()
export class ConferenceEventsListener {
  private readonly logger = new Logger(ConferenceEventsListener.name);

  @OnEvent(CONFERENCE_EVENTS.JOINED)
  @OnEvent(CONFERENCE_EVENTS.LEFT)
  @OnEvent(CONFERENCE_EVENTS.RECORDING_HOOK)
  onConference(payload: ConferenceEventPayload): void {
    this.logger.log(JSON.stringify({ event: 'conference.listener', ...payload }));
  }
}
