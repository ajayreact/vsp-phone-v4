import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { MediaLifecycleRequestDto } from '../dto/telecom.request.dto';
import type { MediaLifecycleResponseDto } from '../dto/telecom.response.dto';
import { PrismaService } from '../prisma/prisma.service';
import { TelecomRedisService } from '../redis/telecom-redis.service';
import type { TelecomCallMeta } from '../telecom.service.interface';

const CORR_TTL_SEC = 86_400;

/**
 * Phase 9 — RTPengine media lifecycle correlation (Redis only; no SDP in Prisma).
 * Kamailio POST /media/lifecycle on offer/answer/delete with platformUuid.
 */
@Injectable()
export class MediaLifecycleService {
  private readonly logger = new Logger(MediaLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
  ) {}

  async record(
    dto: MediaLifecycleRequestDto,
    meta: TelecomCallMeta,
  ): Promise<MediaLifecycleResponseDto> {
    const session = await this.prisma.callSession.findFirst({
      where: { platformUuid: dto.platformUuid, deletedAt: null },
      select: { id: true, tenantId: true },
    });
    if (!session) {
      throw new NotFoundException(`CallSession not found for platformUuid=${dto.platformUuid}`);
    }

    const rtpSessionId = dto.rtpSessionId ?? dto.sipCallId;
    const ts = new Date().toISOString();

    await this.redis.setex(
      this.redis.corrRtpKey(session.tenantId, rtpSessionId),
      CORR_TTL_SEC,
      JSON.stringify({
        platformUuid: dto.platformUuid,
        tenantId: session.tenantId,
        event: dto.event,
        sipCallId: dto.sipCallId,
        rtpSessionId,
        ts,
      }),
    );

    const platformKey = this.redis.corrPlatformKey(session.tenantId, dto.platformUuid);
    const existing = await this.redis.get(platformKey);
    let platformCorr: Record<string, unknown> = {};
    if (existing) {
      try {
        platformCorr = JSON.parse(existing) as Record<string, unknown>;
      } catch {
        platformCorr = {};
      }
    }
    platformCorr.rtpSessionId = rtpSessionId;
    platformCorr.mediaAnchored = dto.event !== 'delete';
    platformCorr.lastMediaEvent = dto.event;
    platformCorr.lastMediaEventAt = ts;
    if (dto.event === 'delete') {
      platformCorr.mediaAnchored = false;
    }
    await this.redis.setex(platformKey, CORR_TTL_SEC, JSON.stringify(platformCorr));

    if (dto.event === 'delete') {
      await this.redis.del(this.redis.corrRtpKey(session.tenantId, rtpSessionId));
    }

    this.logger.log(
      JSON.stringify({
        event: 'telecom.media.lifecycle',
        requestId: meta.requestId,
        correlationId: meta.correlationId,
        platformUuid: dto.platformUuid,
        mediaEvent: dto.event,
        sipCallId: dto.sipCallId,
        rtpSessionId,
        tenantId: session.tenantId,
      }),
    );

    return {
      accepted: true,
      platformUuid: dto.platformUuid,
      event: dto.event,
      rtpSessionId,
      placeholder: false,
    };
  }
}
