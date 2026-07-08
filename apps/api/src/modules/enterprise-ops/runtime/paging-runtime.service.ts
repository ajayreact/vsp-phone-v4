import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CallLifecycleState, CallType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { RouteResponseDto } from '../../telecom/dto/telecom.response.dto';
import { TELECOM_TIMEOUTS_MS } from '../../telecom/dto/telecom.request.dto';
import type { TelecomCallMeta } from '../../telecom/telecom.service.interface';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { LineForkService } from './line-fork.service';

/** Phase 14 — one-to-many paging with auto-answer hints. */
@Injectable()
export class PagingRuntimeService {
  private readonly logger = new Logger(PagingRuntimeService.name);
  private readonly mediaUri: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fork: LineForkService,
    config: ConfigService,
  ) {
    this.mediaUri = config.get<string>('PAGING_MEDIA_URI') || 'sip:page@media.vsp.internal';
  }

  async page(params: {
    tenantId: string;
    code: string;
    lineIds: string[];
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
        callType: CallType.INTERNAL,
        state: CallLifecycleState.DIALING,
        startedAt: new Date(),
      },
    });

    const forkActions = await this.fork.buildForkActions({
      tenantId: params.tenantId,
      lineIds: params.lineIds,
      strategy: 'FORK',
      hints: {
        'Answer-Mode': 'Auto',
        'Alert-Info': 'info=alert-autoanswer',
        'Call-Info': 'answer-after=0',
      },
    });

    const actions = forkActions.length
      ? forkActions
      : [
          {
            type: 'APP_MEDIA' as const,
            target: `${this.mediaUri}?page=${params.code}&lines=${params.lineIds.join(',')}`,
            priority: 0,
            hints: { 'Answer-Mode': 'Auto' },
          },
        ];

    this.logger.log(
      JSON.stringify({
        event: 'paging.offered',
        tenantId: params.tenantId,
        platformUuid,
        code: params.code,
        memberCount: params.lineIds.length,
      }),
    );

    const plan: RouteResponseDto = {
      platformUuid,
      tenantId: params.tenantId,
      callSessionId,
      fromLineId: params.fromLineId,
      callIntent: 'INTERNAL',
      actions,
      recording: { enabled: false, pauseAllowed: false },
      rtp: {},
      timers: { noAnswerSec: 15, queueRingSec: 15, ivrTimeoutSec: 10 },
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: params.meta.idempotencyKey,
    };

    return { platformUuid, callSessionId, plan };
  }
}
