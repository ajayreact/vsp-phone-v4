import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RouteResponseDto } from '../../telecom/dto/telecom.response.dto';
import { TELECOM_TIMEOUTS_MS } from '../../telecom/dto/telecom.request.dto';
import type { TelecomCallMeta } from '../../telecom/telecom.service.interface';
import { PrismaService } from '../../telecom/prisma/prisma.service';

/** Phase 13 — voicemail destination (APP_MEDIA / VOICEMAIL action). */
@Injectable()
export class VoicemailRuntimeService {
  private readonly vmUri: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.vmUri = config.get<string>('VOICEMAIL_MEDIA_URI') || 'sip:vm@media.vsp.internal';
  }

  async buildVoicemailPlan(params: {
    tenantId: string;
    platformUuid: string;
    callSessionId: string;
    voicemailId?: string;
    lineId?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto> {
    let target = this.vmUri;
    if (params.voicemailId) {
      const vm = await this.prisma.voicemail.findFirst({
        where: { id: params.voicemailId, tenantId: params.tenantId, deletedAt: null },
      });
      if (vm) target = `${this.vmUri}?vm=${vm.id}`;
    } else if (params.lineId) {
      const vm = await this.prisma.voicemail.findFirst({
        where: { lineId: params.lineId, tenantId: params.tenantId, deletedAt: null },
      });
      if (vm) target = `${this.vmUri}?line=${params.lineId}`;
    }

    return {
      platformUuid: params.platformUuid,
      tenantId: params.tenantId,
      callSessionId: params.callSessionId,
      toLineId: params.lineId,
      callIntent: 'INTERNAL',
      actions: [{ type: 'VOICEMAIL', target, priority: 0, lineId: params.lineId }],
      recording: { enabled: false, pauseAllowed: false },
      rtp: {},
      timers: { noAnswerSec: 120, queueRingSec: 30, ivrTimeoutSec: 10 },
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.route,
      idempotencyKey: params.meta.idempotencyKey,
    };
  }
}
