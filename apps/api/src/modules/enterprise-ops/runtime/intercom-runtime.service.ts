import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallLifecycleState, CallType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { RouteResponseDto } from '../../telecom/dto/telecom.response.dto';
import { TELECOM_TIMEOUTS_MS } from '../../telecom/dto/telecom.request.dto';
import type { TelecomCallMeta } from '../../telecom/telecom.service.interface';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { LineForkService } from './line-fork.service';

/** Phase 14 — one-way and two-way intercom. */
@Injectable()
export class IntercomRuntimeService {
  private readonly logger = new Logger(IntercomRuntimeService.name);
  private readonly mediaUri: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fork: LineForkService,
    config: ConfigService,
  ) {
    this.mediaUri = config.get<string>('INTERCOM_MEDIA_URI') || 'sip:intercom@media.vsp.internal';
  }

  async intercom(params: {
    tenantId: string;
    code: string;
    targetLineId: string;
    mode: 'one-way' | 'two-way';
    fromLineId?: string;
    platformUuid?: string;
    meta: TelecomCallMeta;
  }): Promise<{ platformUuid: string; callSessionId: string; plan: RouteResponseDto }> {
    const platformUuid = params.platformUuid || randomUUID();
    const callSessionId = randomUUID();
    const publicId = `cs_${callSessionId.replace(/-/g, '').slice(0, 16)}`;

    await this.prisma.callSession.create({
      data: {
        id: callSessionId,
        publicId,
        platformUuid,
        tenantId: params.tenantId,
        fromLineId: params.fromLineId ?? null,
        toLineId: params.targetLineId,
        callType: CallType.INTERNAL,
        state: CallLifecycleState.DIALING,
        startedAt: new Date(),
      },
    });

    const hints =
      params.mode === 'one-way'
        ? { 'Answer-Mode': 'Auto', 'Call-Info': 'answer-after=0;purpose=intercom' }
        : { 'Call-Info': 'purpose=intercom-duplex' };

    const forkActions = await this.fork.buildForkActions({
      tenantId: params.tenantId,
      lineIds: [params.targetLineId],
      strategy: 'FORK',
      hints,
    });

    const actions = forkActions.length
      ? forkActions
      : [
          {
            type: 'APP_MEDIA' as const,
            target: `${this.mediaUri}?mode=${params.mode}&line=${params.targetLineId}`,
            priority: 0,
            hints,
          },
        ];

    this.logger.log(
      JSON.stringify({
        event: 'intercom.offered',
        tenantId: params.tenantId,
        platformUuid,
        mode: params.mode,
        targetLineId: params.targetLineId,
      }),
    );

    const plan: RouteResponseDto = {
      platformUuid,
      tenantId: params.tenantId,
      callSessionId,
      fromLineId: params.fromLineId,
      toLineId: params.targetLineId,
      callIntent: 'INTERNAL',
      actions,
      recording: { enabled: false, pauseAllowed: false },
      rtp: {},
      timers: { noAnswerSec: 10, queueRingSec: 10, ivrTimeoutSec: 10 },
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: params.meta.idempotencyKey,
    };

    return { platformUuid, callSessionId, plan };
  }
}
