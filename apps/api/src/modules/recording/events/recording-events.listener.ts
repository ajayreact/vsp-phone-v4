import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  RECORDING_DOMAIN_EVENTS,
  RECORDING_EVENTS,
  type RecordingEventPayload,
  type RecordingStartedDomainPayload,
} from './recording.events';

/** Phase 12 — structured logging for recording integration events. */
@Injectable()
export class RecordingEventsListener {
  private readonly logger = new Logger(RecordingEventsListener.name);

  @OnEvent(RECORDING_EVENTS.STARTED)
  @OnEvent(RECORDING_EVENTS.PAUSED)
  @OnEvent(RECORDING_EVENTS.RESUMED)
  @OnEvent(RECORDING_EVENTS.COMPLETED)
  @OnEvent(RECORDING_EVENTS.FAILED)
  onRecording(payload: RecordingEventPayload): void {
    this.logger.log(JSON.stringify({ event: 'recording.listener', ...payload }));
  }

  @OnEvent(RECORDING_DOMAIN_EVENTS.STARTED)
  onDomainStarted(payload: RecordingStartedDomainPayload): void {
    this.logger.log(JSON.stringify({ event: RECORDING_DOMAIN_EVENTS.STARTED, ...payload }));
  }
}
