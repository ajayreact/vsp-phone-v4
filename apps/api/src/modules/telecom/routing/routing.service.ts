import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CallLifecycleState,
  CallParticipantRole,
  CallParticipantStatus,
  CallType,
  DeviceStatus,
  LineStatus,
  TenantStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { CarrierService, normalizeE164 } from '../../carrier/carrier.service';
import type { TrunkHint } from '../../carrier/carrier-adapter.interface';
import { RecordingPolicyService } from '../../recording/policy/recording-policy.service';
import { TELECOM_TIMEOUTS_MS } from '../dto/telecom.request.dto';
import type { RouteRequestDto } from '../dto/telecom.request.dto';
import type { RouteActionDto, RouteResponseDto } from '../dto/telecom.response.dto';
import type { TelecomCallMeta } from '../telecom.service.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TelecomRedisService } from '../redis/telecom-redis.service';
import {
  CALL_EVENTS,
  type CallCreatedPayload,
  type CallLifecyclePayload,
} from '../events/call.events';
import type { RegistrationContactBinding } from '../events/registration.events';
import { CallAppsRoutingService } from './routing-continue.service';
import { EnterpriseOpsRoutingService } from '../../enterprise-ops/runtime/enterprise-ops-routing.service';

const CORR_TTL_SEC = 2 * 60 * 60; // ≥ 2h per ADR-019
const ROUTE_IDEM_TTL_SEC = 30;
const NO_ANSWER_SEC = 30;

interface ResolvedLineCtx {
  tenantId: string;
  lineId: string;
  extension?: string;
  aor?: string;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  callerIdName?: string;
  callerIdNumber?: string;
  devices: Array<{
    id: string;
    status: DeviceStatus;
    aor?: string;
    priority: number;
  }>;
}

/**
 * Phase 7 — internal Line→Line route resolution + CallSession create.
 * Phase 8 — PSTN outbound (BRIDGE_CARRIER) + inbound DID (FORK).
 * Never writes sipCallId (ADR-019).
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly events: EventEmitter2,
    private readonly carriers: CarrierService,
    private readonly recordingPolicy: RecordingPolicyService,
    private readonly callAppsRouting: CallAppsRoutingService,
    private readonly enterpriseOps: EnterpriseOpsRoutingService,
  ) {}

  async resolve(dto: RouteRequestDto, meta: TelecomCallMeta): Promise<RouteResponseDto> {
    const idemHash = createHash('sha256')
      .update(`${dto.callId}|${dto.requestUri}`)
      .digest('hex')
      .slice(0, 32);
    const idemKey = meta.idempotencyKey
      ? this.redis.routeIdempotencyKey(meta.idempotencyKey)
      : this.redis.routeIdempotencyKey(idemHash);

    const cached = await this.redis.get(idemKey);
    if (cached) {
      try {
        return JSON.parse(cached) as RouteResponseDto;
      } catch {
        /* ignore */
      }
    }

    if (!this.prisma.connected) {
      return this.rejectPlan(undefined, undefined, 503, 'SERVICE_UNAVAILABLE', meta);
    }

    const destUser = extractUserPart(dto.requestUri) ?? extractUserPart(dto.to);
    const callerAor = dto.callerAor ?? extractAor(dto.from);
    let intent: RouteResponseDto['callIntent'] =
      dto.intentHint === 'INBOUND' || dto.intentHint === 'OUTBOUND'
        ? dto.intentHint
        : 'INTERNAL';

    // Phase 8: infer PSTN intent when hint is INTERNAL / absent
    if (intent === 'INTERNAL' && dto.dnis) {
      intent = 'INBOUND';
    } else if (intent === 'INTERNAL' && destUser && looksLikeE164User(destUser)) {
      intent = 'OUTBOUND';
    }

    if (intent === 'OUTBOUND') {
      return await this.resolveOutbound(dto, meta, destUser, callerAor, idemKey);
    }
    if (intent === 'INBOUND') {
      return await this.resolveInbound(dto, meta, destUser, idemKey);
    }

    return await this.resolveInternal(dto, meta, destUser, callerAor, idemKey);
  }

  private async resolveInternal(
    dto: RouteRequestDto,
    meta: TelecomCallMeta,
    destUser: string | null,
    callerAor: string | undefined,
    idemKey: string,
  ): Promise<RouteResponseDto> {
    if (!destUser) {
      return this.rejectPlan(undefined, undefined, 404, 'DEST_UNPARSEABLE', meta);
    }

    const callerCtx = callerAor
      ? await this.resolveLineByAorOrExtension(callerAor, extractUserPart(callerAor), dto.tenantId)
      : null;

    const enterprisePlan = await this.enterpriseOps.resolveFeature({
      code: destUser,
      tenantId: callerCtx?.tenantId ?? dto.tenantId,
      fromLineId: callerCtx?.lineId,
      platformUuid: meta.platformUuid,
      meta,
    });
    if (enterprisePlan) {
      await this.redis.setex(idemKey, ROUTE_IDEM_TTL_SEC, JSON.stringify(enterprisePlan));
      return enterprisePlan;
    }

    const appPlan = await this.callAppsRouting.resolveAppDestination({
      code: destUser,
      tenantId: callerCtx?.tenantId ?? dto.tenantId,
      fromLineId: callerCtx?.lineId,
      platformUuid: meta.platformUuid,
      meta,
    });
    if (appPlan) {
      await this.redis.setex(idemKey, ROUTE_IDEM_TTL_SEC, JSON.stringify(appPlan));
      return appPlan;
    }

    const destCtx = await this.resolveLineByAorOrExtension(
      dto.requestUri,
      destUser,
      callerCtx?.tenantId ?? dto.tenantId,
    );

    if (!destCtx) {
      return this.rejectPlan(callerCtx?.tenantId, undefined, 404, 'EXTENSION_NOT_FOUND', meta);
    }

    if (
      callerCtx &&
      callerCtx.tenantId !== destCtx.tenantId
    ) {
      return this.rejectPlan(callerCtx.tenantId, undefined, 403, 'TENANT_ISOLATION', meta);
    }

    const tenantId = destCtx.tenantId;
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });
    if (
      !tenant ||
      (tenant.status !== TenantStatus.ACTIVE && tenant.status !== TenantStatus.PENDING)
    ) {
      return this.rejectPlan(tenantId, undefined, 403, 'TENANT_INACTIVE', meta);
    }

    // CallPolicy
    if (callerCtx && !callerCtx.outboundEnabled) {
      return this.rejectPlan(tenantId, callerCtx.lineId, 403, 'OUTBOUND_DISABLED', meta);
    }
    if (!destCtx.inboundEnabled) {
      return this.rejectPlan(tenantId, destCtx.lineId, 403, 'INBOUND_DISABLED', meta);
    }

    // Busy: active session on destination line
    const busy = await this.prisma.callSession.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        toLineId: destCtx.lineId,
        state: {
          in: [
            CallLifecycleState.DIALING,
            CallLifecycleState.RINGING,
            CallLifecycleState.ANSWERED,
            CallLifecycleState.ACTIVE,
            CallLifecycleState.HOLD,
          ],
        },
      },
      select: { id: true },
    });
    if (busy) {
      return this.rejectPlan(tenantId, destCtx.lineId, 486, 'BUSY', meta);
    }

    // Device selection + Redis contacts (multi-device fork)
    const forkActions: RouteActionDto[] = [];
    const sortedDevices = [...destCtx.devices].sort((a, b) => a.priority - b.priority);

    for (const device of sortedDevices) {
      if (
        device.status !== DeviceStatus.REGISTERED &&
        device.status !== DeviceStatus.ONLINE &&
        device.status !== DeviceStatus.BUSY
      ) {
        continue;
      }
      const contacts = device.aor
        ? await this.activeContacts(tenantId, device.aor)
        : [];
      if (!contacts.length) continue;

      let prio = device.priority;
      for (const c of contacts) {
        forkActions.push({
          type: 'FORK',
          target: c.contact,
          priority: prio++,
          deviceId: device.id,
          lineId: destCtx.lineId,
        });
      }
    }

    if (!forkActions.length) {
      return this.rejectPlan(tenantId, destCtx.lineId, 480, 'NO_REGISTERED_DEVICES', meta);
    }

    const slaExpanded = await this.enterpriseOps.expandSlaFork({
      tenantId,
      primaryLineId: destCtx.lineId,
      existingActions: forkActions,
    });
    if (slaExpanded.length) {
      forkActions.length = 0;
      forkActions.push(...slaExpanded);
    }

    const platformUuid = meta.platformUuid || randomUUID();
    const callSessionId = randomUUID();
    const publicId = `cs_${callSessionId.replace(/-/g, '').slice(0, 16)}`;
    const now = new Date();

    // Persist CallSession — never set sipCallId (ADR-019)
    await this.prisma.callSession.create({
      data: {
        id: callSessionId,
        publicId,
        platformUuid,
        tenantId,
        fromLineId: callerCtx?.lineId,
        toLineId: destCtx.lineId,
        callType: CallType.INTERNAL,
        state: CallLifecycleState.DIALING,
        startedAt: now,
        // ADR-019: never set sipCallId — SIP Call-ID stays in Redis corr only
        participants: {
          create: [
            ...(callerCtx
              ? [
                  {
                    id: randomUUID(),
                    publicId: `cp_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
                    tenantId,
                    lineId: callerCtx.lineId,
                    role: CallParticipantRole.CALLER,
                    status: CallParticipantStatus.INVITED,
                  },
                ]
              : []),
            {
              id: randomUUID(),
              publicId: `cp_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
              tenantId,
              lineId: destCtx.lineId,
              role: CallParticipantRole.CALLEE,
              status: CallParticipantStatus.INVITED,
            },
            ...forkActions
              .filter((a, i, arr) => a.deviceId && arr.findIndex((x) => x.deviceId === a.deviceId) === i)
              .map((a) => ({
                id: randomUUID(),
                publicId: `cp_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
                tenantId,
                lineId: destCtx.lineId,
                deviceId: a.deviceId,
                role: CallParticipantRole.CALLEE,
                status: CallParticipantStatus.INVITED,
              })),
          ],
        },
      },
    });

    // Redis corr + runtime (sip Call-ID only in Redis)
    const runtime = {
      platformUuid,
      callSessionId,
      tenantId,
      sipCallId: dto.callId,
      fromLineId: callerCtx?.lineId,
      toLineId: destCtx.lineId,
      callIntent: 'INTERNAL',
      state: CallLifecycleState.DIALING,
      forks: forkActions.map((a) => ({
        contact: a.target,
        deviceId: a.deviceId,
        priority: a.priority,
      })),
      createdAt: now.toISOString(),
    };
    await this.redis.setex(
      this.redis.callRuntimeKey(tenantId, platformUuid),
      CORR_TTL_SEC,
      JSON.stringify(runtime),
    );
    await this.redis.setex(
      this.redis.corrSipKey(tenantId, dto.callId),
      CORR_TTL_SEC,
      JSON.stringify({ platformUuid, callSessionId, legs: forkActions.map((a) => a.target) }),
    );

    const recording = await this.recordingPolicy.evaluateRouteRecording({
      tenantId,
      fromLineId: callerCtx?.lineId,
      toLineId: destCtx.lineId,
      callIntent: 'INTERNAL',
    });
    await this.redis.setex(
      this.redis.corrPlatformKey(tenantId, platformUuid),
      CORR_TTL_SEC,
      JSON.stringify({
        sipCallIds: [dto.callId],
        callSessionId,
        recordingEnabled: recording.enabled,
      }),
    );

    const plan: RouteResponseDto = {
      platformUuid,
      tenantId,
      callSessionId,
      fromLineId: callerCtx?.lineId,
      toLineId: destCtx.lineId,
      callIntent: 'INTERNAL',
      actions: forkActions,
      recording,
      rtp: { flags: undefined },
      timers: {
        noAnswerSec: NO_ANSWER_SEC,
        queueRingSec: NO_ANSWER_SEC,
        ivrTimeoutSec: 10,
      },
      callerIdName: callerCtx?.callerIdName,
      callerIdNumber: callerCtx?.callerIdNumber,
      forkContacts: forkActions.map((a) => a.target!).filter(Boolean),
      forkContactsCsv: forkActions
        .map((a) => a.target!)
        .filter(Boolean)
        .join(','),
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: meta.idempotencyKey,
    };

    await this.redis.setex(idemKey, ROUTE_IDEM_TTL_SEC, JSON.stringify(plan));

    const created: CallCreatedPayload = {
      eventId: randomUUID(),
      type: CALL_EVENTS.CREATED,
      tenantId,
      platformUuid,
      callSessionId,
      callIntent: 'INTERNAL',
      fromLineId: callerCtx?.lineId,
      toLineId: destCtx.lineId,
      forkCount: forkActions.length,
      ts: now.toISOString(),
    };
    this.events.emit(CALL_EVENTS.CREATED, created);

    this.logger.log(
      JSON.stringify({
        event: 'telecom.route.resolve',
        platformUuid,
        callSessionId,
        tenantId,
        forkCount: forkActions.length,
        requestId: meta.requestId,
      }),
    );

    return plan;
  }

  private async resolveOutbound(
    dto: RouteRequestDto,
    meta: TelecomCallMeta,
    destUser: string | null,
    callerAor: string | undefined,
    idemKey: string,
  ): Promise<RouteResponseDto> {
    if (!callerAor) {
      return this.rejectPlan(undefined, undefined, 403, 'CALLER_REQUIRED', meta, 'OUTBOUND');
    }

    const callerCtx = await this.resolveLineByAorOrExtension(
      callerAor,
      extractUserPart(callerAor),
      dto.tenantId,
    );
    if (!callerCtx) {
      return this.rejectPlan(dto.tenantId, undefined, 404, 'CALLER_LINE_NOT_FOUND', meta, 'OUTBOUND');
    }
    if (!callerCtx.outboundEnabled) {
      return this.rejectPlan(
        callerCtx.tenantId,
        callerCtx.lineId,
        403,
        'OUTBOUND_DISABLED',
        meta,
        'OUTBOUND',
      );
    }

    const tenantId = callerCtx.tenantId;
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });
    if (
      !tenant ||
      (tenant.status !== TenantStatus.ACTIVE && tenant.status !== TenantStatus.PENDING)
    ) {
      return this.rejectPlan(tenantId, callerCtx.lineId, 403, 'TENANT_INACTIVE', meta, 'OUTBOUND');
    }

    const cliRaw = dto.cli ?? callerCtx.callerIdNumber;
    const cliResult = await this.carriers.validateCli(tenantId, cliRaw);
    if (!cliResult.ok) {
      return this.rejectPlan(
        tenantId,
        callerCtx.lineId,
        403,
        cliResult.reason ?? 'CLI_INVALID',
        meta,
        'OUTBOUND',
      );
    }

    const destinationE164 = destUser ? normalizeE164(destUser) : null;
    if (!destinationE164) {
      return this.rejectPlan(tenantId, callerCtx.lineId, 404, 'DEST_UNPARSEABLE', meta, 'OUTBOUND');
    }

    const trunk: TrunkHint | null = await this.carriers.selectOutboundTrunk({
      tenantId,
      fromLineId: callerCtx.lineId,
      cliE164: cliResult.number,
      destinationE164,
    });
    if (!trunk) {
      return this.rejectPlan(
        tenantId,
        callerCtx.lineId,
        503,
        'CARRIER_UNAVAILABLE',
        meta,
        'OUTBOUND',
      );
    }

    const platformUuid = meta.platformUuid || randomUUID();
    const callSessionId = randomUUID();
    const publicId = `cs_${callSessionId.replace(/-/g, '').slice(0, 16)}`;
    const now = new Date();
    const bridgeTarget = `sip:${destinationE164}@${trunk.sipHost}:${trunk.sipPort}`;

    // Persist CallSession — never set sipCallId (ADR-019)
    await this.prisma.callSession.create({
      data: {
        id: callSessionId,
        publicId,
        platformUuid,
        tenantId,
        fromLineId: callerCtx.lineId,
        phoneNumberId: cliResult.phoneNumberId,
        callType: CallType.OUTBOUND_PSTN,
        state: CallLifecycleState.DIALING,
        startedAt: now,
        participants: {
          create: [
            {
              id: randomUUID(),
              publicId: `cp_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
              tenantId,
              lineId: callerCtx.lineId,
              role: CallParticipantRole.CALLER,
              status: CallParticipantStatus.INVITED,
            },
          ],
        },
      },
    });

    const runtime = {
      platformUuid,
      callSessionId,
      tenantId,
      sipCallId: dto.callId,
      fromLineId: callerCtx.lineId,
      callIntent: 'OUTBOUND',
      carrierCode: trunk.carrierCode,
      destinationE164,
      state: CallLifecycleState.DIALING,
      createdAt: now.toISOString(),
    };
    await this.redis.setex(
      this.redis.callRuntimeKey(tenantId, platformUuid),
      CORR_TTL_SEC,
      JSON.stringify(runtime),
    );
    await this.redis.setex(
      this.redis.corrSipKey(tenantId, dto.callId),
      CORR_TTL_SEC,
      JSON.stringify({ platformUuid, callSessionId, legs: [bridgeTarget] }),
    );
    await this.redis.setex(
      this.redis.corrPlatformKey(tenantId, platformUuid),
      CORR_TTL_SEC,
      JSON.stringify({
        sipCallIds: [dto.callId],
        callSessionId,
        carrierCode: trunk.carrierCode,
      }),
    );

    const recording = await this.recordingPolicy.evaluateRouteRecording({
      tenantId,
      fromLineId: callerCtx.lineId,
      callIntent: 'OUTBOUND',
    });

    const plan: RouteResponseDto = {
      platformUuid,
      tenantId,
      callSessionId,
      fromLineId: callerCtx.lineId,
      callIntent: 'OUTBOUND',
      actions: [
        {
          type: 'BRIDGE_CARRIER',
          target: bridgeTarget,
          priority: 0,
          lineId: callerCtx.lineId,
        },
      ],
      recording,
      rtp: { flags: undefined },
      timers: {
        noAnswerSec: NO_ANSWER_SEC,
        queueRingSec: NO_ANSWER_SEC,
        ivrTimeoutSec: 10,
      },
      callerIdName: callerCtx.callerIdName,
      callerIdNumber: cliResult.number ?? callerCtx.callerIdNumber,
      forkContacts: [],
      forkContactsCsv: '',
      carrierCode: trunk.carrierCode,
      dispatcherSet: trunk.dispatcherSet,
      carrierSipHost: trunk.sipHost,
      carrierSipPort: trunk.sipPort,
      carrierTransport: trunk.transport,
      destinationE164,
      phoneNumberId: cliResult.phoneNumberId,
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: meta.idempotencyKey,
    };

    await this.redis.setex(idemKey, ROUTE_IDEM_TTL_SEC, JSON.stringify(plan));

    const created: CallCreatedPayload = {
      eventId: randomUUID(),
      type: CALL_EVENTS.CREATED,
      tenantId,
      platformUuid,
      callSessionId,
      callIntent: 'OUTBOUND',
      fromLineId: callerCtx.lineId,
      forkCount: 0,
      ts: now.toISOString(),
    };
    this.events.emit(CALL_EVENTS.CREATED, created);

    this.logger.log(
      JSON.stringify({
        event: 'telecom.route.resolve.outbound',
        platformUuid,
        callSessionId,
        tenantId,
        carrierCode: trunk.carrierCode,
        destinationE164,
        requestId: meta.requestId,
      }),
    );

    return plan;
  }

  private async resolveInbound(
    dto: RouteRequestDto,
    meta: TelecomCallMeta,
    destUser: string | null,
    idemKey: string,
  ): Promise<RouteResponseDto> {
    const dnisRaw = dto.dnis ?? destUser ?? extractUserPart(dto.to);
    if (!dnisRaw) {
      return this.rejectPlan(undefined, undefined, 404, 'DNIS_REQUIRED', meta, 'INBOUND');
    }

    const did = await this.carriers.lookupDid(dnisRaw, dto.tenantId);
    if (!did) {
      return this.rejectPlan(dto.tenantId, undefined, 404, 'DNIS_NOT_FOUND', meta, 'INBOUND');
    }
    const tenantId = did.tenantId;

    const appPlan = await this.callAppsRouting.resolveDnisToApp({
      phoneNumberId: did.phoneNumberId,
      tenantId,
      meta,
    });
    if (appPlan) {
      await this.redis.setex(idemKey, ROUTE_IDEM_TTL_SEC, JSON.stringify(appPlan));
      return appPlan;
    }

    if (!did.lineId) {
      return this.rejectPlan(did.tenantId, undefined, 404, 'DNIS_NO_LINE', meta, 'INBOUND');
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });
    if (
      !tenant ||
      (tenant.status !== TenantStatus.ACTIVE && tenant.status !== TenantStatus.PENDING)
    ) {
      return this.rejectPlan(tenantId, did.lineId, 403, 'TENANT_INACTIVE', meta, 'INBOUND');
    }

    // Load destination line by DID → Line (same shape as internal)
    const line = await this.prisma.line.findFirst({
      where: { id: did.lineId, tenantId, deletedAt: null, status: LineStatus.ACTIVE },
      include: {
        callPolicy: true,
        callerId: { include: { phoneNumber: true } },
        extension: true,
        devices: { include: { sipEndpoint: true } },
      },
    });
    const destCtx = line ? this.toLineCtx(line) : null;

    if (!destCtx) {
      return this.rejectPlan(tenantId, did.lineId, 404, 'EXTENSION_NOT_FOUND', meta, 'INBOUND');
    }

    if (!destCtx.inboundEnabled) {
      return this.rejectPlan(tenantId, destCtx.lineId, 403, 'INBOUND_DISABLED', meta, 'INBOUND');
    }

    const busy = await this.prisma.callSession.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        toLineId: destCtx.lineId,
        state: {
          in: [
            CallLifecycleState.DIALING,
            CallLifecycleState.RINGING,
            CallLifecycleState.ANSWERED,
            CallLifecycleState.ACTIVE,
            CallLifecycleState.HOLD,
          ],
        },
      },
      select: { id: true },
    });
    if (busy) {
      return this.rejectPlan(tenantId, destCtx.lineId, 486, 'BUSY', meta, 'INBOUND');
    }

    const forkActions: RouteActionDto[] = [];
    const sortedDevices = [...destCtx.devices].sort((a, b) => a.priority - b.priority);

    for (const device of sortedDevices) {
      if (
        device.status !== DeviceStatus.REGISTERED &&
        device.status !== DeviceStatus.ONLINE &&
        device.status !== DeviceStatus.BUSY
      ) {
        continue;
      }
      const contacts = device.aor
        ? await this.activeContacts(tenantId, device.aor)
        : [];
      if (!contacts.length) continue;

      let prio = device.priority;
      for (const c of contacts) {
        forkActions.push({
          type: 'FORK',
          target: c.contact,
          priority: prio++,
          deviceId: device.id,
          lineId: destCtx.lineId,
        });
      }
    }

    if (!forkActions.length) {
      return this.rejectPlan(tenantId, destCtx.lineId, 480, 'NO_REGISTERED_DEVICES', meta, 'INBOUND');
    }

    const platformUuid = meta.platformUuid || randomUUID();
    const callSessionId = randomUUID();
    const publicId = `cs_${callSessionId.replace(/-/g, '').slice(0, 16)}`;
    const now = new Date();

    // Persist CallSession — never set sipCallId (ADR-019)
    await this.prisma.callSession.create({
      data: {
        id: callSessionId,
        publicId,
        platformUuid,
        tenantId,
        toLineId: destCtx.lineId,
        phoneNumberId: did.phoneNumberId,
        callType: CallType.INBOUND_PSTN,
        state: CallLifecycleState.DIALING,
        startedAt: now,
        participants: {
          create: [
            {
              id: randomUUID(),
              publicId: `cp_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
              tenantId,
              lineId: destCtx.lineId,
              role: CallParticipantRole.CALLEE,
              status: CallParticipantStatus.INVITED,
            },
            ...forkActions
              .filter((a, i, arr) => a.deviceId && arr.findIndex((x) => x.deviceId === a.deviceId) === i)
              .map((a) => ({
                id: randomUUID(),
                publicId: `cp_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
                tenantId,
                lineId: destCtx.lineId,
                deviceId: a.deviceId,
                role: CallParticipantRole.CALLEE,
                status: CallParticipantStatus.INVITED,
              })),
          ],
        },
      },
    });

    const runtime = {
      platformUuid,
      callSessionId,
      tenantId,
      sipCallId: dto.callId,
      toLineId: destCtx.lineId,
      phoneNumberId: did.phoneNumberId,
      callIntent: 'INBOUND',
      carrierCode: did.carrierCode,
      dnis: did.e164,
      state: CallLifecycleState.DIALING,
      forks: forkActions.map((a) => ({
        contact: a.target,
        deviceId: a.deviceId,
        priority: a.priority,
      })),
      createdAt: now.toISOString(),
    };
    await this.redis.setex(
      this.redis.callRuntimeKey(tenantId, platformUuid),
      CORR_TTL_SEC,
      JSON.stringify(runtime),
    );
    await this.redis.setex(
      this.redis.corrSipKey(tenantId, dto.callId),
      CORR_TTL_SEC,
      JSON.stringify({ platformUuid, callSessionId, legs: forkActions.map((a) => a.target) }),
    );

    const recording = await this.recordingPolicy.evaluateRouteRecording({
      tenantId,
      toLineId: destCtx.lineId,
      callIntent: 'INBOUND',
    });
    await this.redis.setex(
      this.redis.corrPlatformKey(tenantId, platformUuid),
      CORR_TTL_SEC,
      JSON.stringify({
        sipCallIds: [dto.callId],
        callSessionId,
        carrierCode: did.carrierCode,
        recordingEnabled: recording.enabled,
      }),
    );

    const plan: RouteResponseDto = {
      platformUuid,
      tenantId,
      callSessionId,
      toLineId: destCtx.lineId,
      callIntent: 'INBOUND',
      actions: forkActions,
      recording,
      rtp: { flags: undefined },
      timers: {
        noAnswerSec: NO_ANSWER_SEC,
        queueRingSec: NO_ANSWER_SEC,
        ivrTimeoutSec: 10,
      },
      forkContacts: forkActions.map((a) => a.target!).filter(Boolean),
      forkContactsCsv: forkActions
        .map((a) => a.target!)
        .filter(Boolean)
        .join(','),
      carrierCode: did.carrierCode,
      phoneNumberId: did.phoneNumberId,
      destinationE164: did.e164,
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: meta.idempotencyKey,
    };

    await this.redis.setex(idemKey, ROUTE_IDEM_TTL_SEC, JSON.stringify(plan));

    const created: CallCreatedPayload = {
      eventId: randomUUID(),
      type: CALL_EVENTS.CREATED,
      tenantId,
      platformUuid,
      callSessionId,
      callIntent: 'INBOUND',
      toLineId: destCtx.lineId,
      forkCount: forkActions.length,
      ts: now.toISOString(),
    };
    this.events.emit(CALL_EVENTS.CREATED, created);

    this.logger.log(
      JSON.stringify({
        event: 'telecom.route.resolve.inbound',
        platformUuid,
        callSessionId,
        tenantId,
        dnis: did.e164,
        forkCount: forkActions.length,
        requestId: meta.requestId,
      }),
    );

    return plan;
  }

  async onCallUpdate(
    platformUuid: string,
    state: string,
    meta: TelecomCallMeta,
  ): Promise<void> {
    if (!this.prisma.connected) return;
    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid, deletedAt: null },
    });
    if (!session) return;

    let next: CallLifecycleState | null = null;
    let eventType: CallLifecyclePayload['type'] | null = null;
    const data: {
      state?: CallLifecycleState;
      answeredAt?: Date;
      endedAt?: Date;
    } = {};

    if (state === 'RINGING') {
      next = CallLifecycleState.RINGING;
      eventType = CALL_EVENTS.RINGING;
    } else if (state === 'ANSWERED') {
      next = CallLifecycleState.ANSWERED;
      eventType = CALL_EVENTS.ANSWERED;
      data.answeredAt = new Date();
    } else if (state === 'HOLD') {
      next = CallLifecycleState.HOLD;
    }

    if (!next || !eventType) return;
    data.state = next;
    await this.prisma.callSession.update({ where: { id: session.id }, data });

    const runtimeKey = this.redis.callRuntimeKey(session.tenantId, platformUuid);
    const runtime = await this.redis.get(runtimeKey);
    if (runtime) {
      try {
        const parsed = JSON.parse(runtime) as Record<string, unknown>;
        parsed.state = next;
        await this.redis.setex(runtimeKey, CORR_TTL_SEC, JSON.stringify(parsed));
      } catch {
        /* ignore */
      }
    }

    this.events.emit(eventType, {
      eventId: randomUUID(),
      type: eventType,
      tenantId: session.tenantId,
      platformUuid,
      callSessionId: session.id,
      state: next,
      ts: new Date().toISOString(),
    } satisfies CallLifecyclePayload);

    void meta;
  }

  async onCallEnd(
    platformUuid: string,
    cause: string | undefined,
    meta: TelecomCallMeta,
  ): Promise<void> {
    if (!this.prisma.connected) return;
    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid, deletedAt: null },
    });
    if (!session) return;

    await this.prisma.callSession.update({
      where: { id: session.id },
      data: { state: CallLifecycleState.ENDED, endedAt: new Date() },
    });

    this.events.emit(CALL_EVENTS.ENDED, {
      eventId: randomUUID(),
      type: CALL_EVENTS.ENDED,
      tenantId: session.tenantId,
      platformUuid,
      callSessionId: session.id,
      state: CallLifecycleState.ENDED,
      cause,
      ts: new Date().toISOString(),
    } satisfies CallLifecyclePayload);

    void meta;
  }

  private async resolveLineByAorOrExtension(
    aorOrUri: string | undefined,
    userPart: string | null | undefined,
    tenantHint?: string,
  ): Promise<ResolvedLineCtx | null> {
    const aor = aorOrUri ? normalizeAor(extractAor(aorOrUri) ?? aorOrUri) : undefined;

    // Prefer SIPEndpoint by AoR
    if (aor) {
      const ep = await this.prisma.sIPEndpoint.findFirst({
        where: {
          deletedAt: null,
          aor: { equals: aor, mode: 'insensitive' },
          ...(tenantHint ? { tenantId: tenantHint } : {}),
        },
        include: {
          device: {
            include: {
              line: {
                include: {
                  callPolicy: true,
                  callerId: { include: { phoneNumber: true } },
                  extension: true,
                  devices: { include: { sipEndpoint: true } },
                },
              },
            },
          },
        },
      });
      if (ep?.device?.line && ep.device.line.status === LineStatus.ACTIVE) {
        return this.toLineCtx(ep.device.line, ep.aor);
      }
    }

    // Extension match (internal dialing)
    if (userPart && /^\d{2,8}$/.test(userPart)) {
      const ext = await this.prisma.extension.findFirst({
        where: {
          deletedAt: null,
          extension: userPart,
          ...(tenantHint ? { tenantId: tenantHint } : {}),
        },
        include: {
          line: {
            include: {
              callPolicy: true,
              callerId: { include: { phoneNumber: true } },
              extension: true,
              devices: { include: { sipEndpoint: true } },
            },
          },
        },
      });
      if (ext?.line && ext.line.status === LineStatus.ACTIVE) {
        return this.toLineCtx(ext.line);
      }
    }

    return null;
  }

  private toLineCtx(
    line: {
      id: string;
      tenantId: string;
      callPolicy: { inboundEnabled: boolean; outboundEnabled: boolean } | null;
      callerId: {
        callerIdName: string | null;
        phoneNumber: { number: string } | null;
      } | null;
      extension: { extension: string } | null;
      devices: Array<{
        id: string;
        status: DeviceStatus;
        deletedAt: Date | null;
        sipEndpoint: { aor: string } | null;
      }>;
    },
    preferredAor?: string,
  ): ResolvedLineCtx {
    const devices = line.devices
      .filter((d) => !d.deletedAt)
      .map((d, idx) => ({
        id: d.id,
        status: d.status,
        aor: d.sipEndpoint?.aor,
        // Stable priority: preferred AoR device first, then order
        priority:
          preferredAor && d.sipEndpoint?.aor.toLowerCase() === preferredAor.toLowerCase()
            ? 0
            : idx + 1,
      }));

    return {
      tenantId: line.tenantId,
      lineId: line.id,
      extension: line.extension?.extension,
      aor: preferredAor,
      inboundEnabled: line.callPolicy?.inboundEnabled ?? true,
      outboundEnabled: line.callPolicy?.outboundEnabled ?? true,
      callerIdName: line.callerId?.callerIdName ?? undefined,
      callerIdNumber: line.callerId?.phoneNumber?.number ?? undefined,
      devices,
    };
  }

  private async activeContacts(
    tenantId: string,
    aor: string,
  ): Promise<RegistrationContactBinding[]> {
    const all = await this.redis.hgetall(this.redis.registrationKey(tenantId, aor));
    const now = Date.now();
    const out: RegistrationContactBinding[] = [];
    for (const raw of Object.values(all)) {
      try {
        const b = JSON.parse(raw) as RegistrationContactBinding;
        if (new Date(b.expiresAt).getTime() > now) out.push(b);
      } catch {
        /* skip */
      }
    }
    return out;
  }

  private rejectPlan(
    tenantId: string | undefined,
    toLineId: string | undefined,
    code: number,
    reason: string,
    meta: TelecomCallMeta,
    intent: RouteResponseDto['callIntent'] = 'INTERNAL',
  ): RouteResponseDto {
    const platformUuid = meta.platformUuid || randomUUID();
    this.events.emit(CALL_EVENTS.REJECTED, {
      eventId: randomUUID(),
      type: CALL_EVENTS.REJECTED,
      tenantId: tenantId ?? 'unknown',
      platformUuid,
      cause: reason,
      ts: new Date().toISOString(),
    } satisfies CallLifecyclePayload);

    this.logger.warn(
      JSON.stringify({
        event: 'telecom.route.reject',
        reason,
        code,
        tenantId,
        requestId: meta.requestId,
      }),
    );

    return {
      platformUuid,
      tenantId,
      toLineId,
      callIntent: intent,
      actions: [
        {
          type: 'REJECT',
          target: reason,
          rejectCode: code,
          rejectReason: reason,
          priority: 0,
        },
      ],
      recording: { enabled: false, pauseAllowed: false },
      rtp: {},
      timers: { noAnswerSec: NO_ANSWER_SEC, queueRingSec: NO_ANSWER_SEC, ivrTimeoutSec: 10 },
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: meta.idempotencyKey,
    };
  }
}

function normalizeAor(aor: string): string {
  return aor.trim().toLowerCase().replace(/^<|>$/g, '');
}

function extractAor(header: string): string | undefined {
  const m = header.match(/<(sip:[^>]+)>/i) || header.match(/(sip:[^\s;>]+)/i);
  return m?.[1];
}

function extractUserPart(uri: string): string | null {
  const aor = extractAor(uri) ?? uri;
  const m = aor.match(/sip:([^@;>\s]+)@/i) || aor.match(/sip:([^@;>\s]+)/i);
  return m?.[1] ?? null;
}

/** True when user part looks like an E.164 / PSTN number (not a short extension). */
function looksLikeE164User(user: string): boolean {
  if (normalizeE164(user)) return true;
  const hasPlus = user.trim().startsWith('+');
  const digits = user.replace(/\D/g, '');
  const candidate = hasPlus ? `+${digits}` : digits;
  return /^\+?\d{8,15}$/.test(candidate);
}
