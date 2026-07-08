import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CALL_EVENTS, type CallCreatedPayload, type CallLifecyclePayload } from '../../telecom/events/call.events';
import { REGISTRATION_EVENTS } from '../../telecom/events/registration.events';
import { QUEUE_EVENTS } from '../../queue/events/queue.events';
import { IVR_EVENTS } from '../../ivr/events/ivr.events';
import { CONFERENCE_EVENTS } from '../../conference/events/conference.events';
import { RECORDING_EVENTS } from '../../recording/events/recording.events';
import { BLF_EVENTS } from '../../enterprise-ops/events/blf.events';
import { PRESENCE_EVENTS } from '../../presence/events/presence.events';
import { PARK_PICKUP_EVENTS } from '../../enterprise-ops/events/park-pickup.events';
import { SUPERVISOR_EVENTS } from '../../enterprise-ops/events/supervisor.events';
import { EnterpriseAuditService } from '../audit/enterprise-audit.service';
import { TelecomStructuredLoggerService } from '../logging/telecom-structured-logger.service';
import type { LogCategory } from '../logging/logging.types';
import { MetricsService } from '../metrics/metrics.service';
import { CallTraceService } from '../tracing/call-trace.service';

/** Phase 15 — unified observability sink for domain events (async, non-blocking). */
@Injectable()
export class ObservabilityEventsListener {
  private readonly logger = new Logger(ObservabilityEventsListener.name);

  constructor(
    private readonly structuredLog: TelecomStructuredLoggerService,
    private readonly metrics: MetricsService,
    private readonly trace: CallTraceService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  @OnEvent(CALL_EVENTS.CREATED)
  onCallCreated(payload: CallCreatedPayload): void {
    this.handle(payload.tenantId, payload.platformUuid, payload.type, 'inbound_call', { ...payload });
    this.metrics.recordCallStarted(payload.tenantId, payload.callIntent);
    this.trace.append({
      platformUuid: payload.platformUuid,
      tenantId: payload.tenantId,
      component: 'nestjs',
      operation: 'call.created',
      status: 'ok',
      eventId: payload.eventId,
    });
  }

  @OnEvent(CALL_EVENTS.RINGING)
  @OnEvent(CALL_EVENTS.ANSWERED)
  onCallLifecycle(payload: CallLifecyclePayload): void {
    const category: LogCategory = payload.type === CALL_EVENTS.ANSWERED ? 'answered' : 'inbound_call';
    this.handle(payload.tenantId, payload.platformUuid, payload.type, category, { ...payload });
    this.trace.append({
      platformUuid: payload.platformUuid,
      tenantId: payload.tenantId,
      component: 'nestjs',
      operation: payload.type,
      status: 'ok',
      eventId: payload.eventId,
    });
    if (payload.type === CALL_EVENTS.ANSWERED) {
      void this.metrics.refreshGauges();
    }
  }

  @OnEvent(CALL_EVENTS.ENDED)
  onCallEnded(payload: CallLifecyclePayload): void {
    this.handle(payload.tenantId, payload.platformUuid, payload.type, 'answered', { ...payload });
    this.metrics.recordCallCompleted(payload.tenantId, 0, true);
    void this.metrics.refreshGauges();
  }

  @OnEvent(CALL_EVENTS.REJECTED)
  onCallRejected(payload: CallLifecyclePayload): void {
    this.handle(payload.tenantId, payload.platformUuid, payload.type, 'rejected', { ...payload });
    this.metrics.recordCallCompleted(payload.tenantId, 0, false);
  }

  @OnEvent(REGISTRATION_EVENTS.CREATED)
  @OnEvent(REGISTRATION_EVENTS.REFRESHED)
  onRegistration(payload: { tenantId: string; deviceId?: string; eventId?: string; type: string }): void {
    this.structuredLog.fromEvent({
      event: payload.type,
      category: 'sip_registration',
      tenantId: payload.tenantId,
      deviceId: payload.deviceId,
    });
    this.metrics.recordRegistration(payload.tenantId, true);
  }

  @OnEvent(REGISTRATION_EVENTS.AUTH_FAILED)
  onAuthFailed(payload: { tenantId?: string; type: string }): void {
    this.structuredLog.fromEvent({
      event: payload.type,
      category: 'authentication',
      severity: 'warn',
      tenantId: payload.tenantId,
    });
    if (payload.tenantId) this.metrics.recordRegistration(payload.tenantId, false);
  }

  @OnEvent(QUEUE_EVENTS.ENTERED)
  @OnEvent(QUEUE_EVENTS.TIMEOUT)
  @OnEvent(QUEUE_EVENTS.OVERFLOW)
  onQueue(payload: { tenantId: string; platformUuid: string; type: string; eventId: string }): void {
    this.emitTrace(payload, 'queue');
    this.structuredLog.fromEvent({
      event: payload.type,
      category: 'queue',
      tenantId: payload.tenantId,
      platformUuid: payload.platformUuid,
    });
  }

  @OnEvent(IVR_EVENTS.DIGIT)
  @OnEvent(IVR_EVENTS.STARTED)
  onIvr(payload: { tenantId: string; platformUuid: string; type: string; eventId: string }): void {
    this.emitTrace(payload, 'ivr');
    this.structuredLog.fromEvent({
      event: payload.type,
      category: 'ivr',
      tenantId: payload.tenantId,
      platformUuid: payload.platformUuid,
    });
  }

  @OnEvent(CONFERENCE_EVENTS.JOINED)
  @OnEvent(CONFERENCE_EVENTS.LEFT)
  onConference(payload: { tenantId: string; platformUuid: string; type: string; eventId: string }): void {
    this.emitTrace(payload, 'nestjs');
    this.structuredLog.fromEvent({
      event: payload.type,
      category: 'conference',
      tenantId: payload.tenantId,
      platformUuid: payload.platformUuid,
    });
  }

  @OnEvent(RECORDING_EVENTS.STARTED)
  @OnEvent(RECORDING_EVENTS.COMPLETED)
  onRecording(payload: { tenantId: string; platformUuid: string; type: string; eventId: string }): void {
    this.emitTrace(payload, 'recording');
    this.metrics.recordRecordingSession(payload.tenantId);
    this.structuredLog.fromEvent({
      event: payload.type,
      category: 'recording',
      tenantId: payload.tenantId,
      platformUuid: payload.platformUuid,
    });
  }

  @OnEvent(BLF_EVENTS.LAMP_CHANGED)
  onBlf(payload: { tenantId: string; platformUuid?: string; type: string; eventId: string }): void {
    this.structuredLog.fromEvent({
      event: payload.type,
      category: 'blf',
      tenantId: payload.tenantId,
      platformUuid: payload.platformUuid,
    });
  }

  @OnEvent(PRESENCE_EVENTS.CHANGED)
  onPresence(payload: { tenantId: string; lineId: string; type: string; eventId: string; platformUuid?: string }): void {
    this.structuredLog.fromEvent({
      event: payload.type,
      category: 'presence',
      tenantId: payload.tenantId,
      lineId: payload.lineId,
      platformUuid: payload.platformUuid,
    });
  }

  @OnEvent(PARK_PICKUP_EVENTS.PARKED)
  @OnEvent(PARK_PICKUP_EVENTS.RETRIEVED)
  onPark(payload: { tenantId: string; platformUuid: string; type: string; eventId: string }): void {
    this.structuredLog.fromEvent({
      event: payload.type,
      category: 'park',
      tenantId: payload.tenantId,
      platformUuid: payload.platformUuid,
    });
  }

  @OnEvent(PARK_PICKUP_EVENTS.PICKUP_ANSWERED)
  onPickup(payload: { tenantId: string; platformUuid: string; type: string; eventId: string }): void {
    this.structuredLog.fromEvent({
      event: payload.type,
      category: 'pickup',
      tenantId: payload.tenantId,
      platformUuid: payload.platformUuid,
    });
  }

  @OnEvent(SUPERVISOR_EVENTS.MONITOR_STARTED)
  @OnEvent(SUPERVISOR_EVENTS.WHISPER_STARTED)
  @OnEvent(SUPERVISOR_EVENTS.BARGE_STARTED)
  onSupervisor(payload: { tenantId: string; platformUuid: string; type: string; eventId: string }): void {
    this.structuredLog.fromEvent({
      event: payload.type,
      category: 'supervisor',
      tenantId: payload.tenantId,
      platformUuid: payload.platformUuid,
    });
    void this.audit.append({
      tenantId: payload.tenantId,
      actorType: 'supervisor',
      action: payload.type,
      resourceType: 'call',
      platformUuid: payload.platformUuid,
    });
  }

  private handle(
    tenantId: string,
    platformUuid: string,
    event: string,
    category: LogCategory,
    detail?: Record<string, unknown>,
  ): void {
    this.structuredLog.fromEvent({
      event,
      category,
      tenantId,
      platformUuid,
      detail,
    });
    this.logger.debug(JSON.stringify({ event: 'observability.event', type: event, platformUuid }));
  }

  private emitTrace(
    payload: { tenantId: string; platformUuid: string; type: string; eventId: string },
    component: 'queue' | 'ivr' | 'nestjs' | 'recording',
  ): void {
    this.trace.append({
      platformUuid: payload.platformUuid,
      tenantId: payload.tenantId,
      component,
      operation: payload.type,
      status: 'ok',
      eventId: payload.eventId,
    });
  }
}
