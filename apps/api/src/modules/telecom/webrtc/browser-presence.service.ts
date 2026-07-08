import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DeviceType, PresenceStatus } from '@prisma/client';
import type { JwtPayload } from '../../auth/jwt.util';
import type { PresenceRequestDto } from '../dto/telecom.request.dto';
import type { PresenceResponseDto } from '../dto/telecom.response.dto';
import { TELECOM_TIMEOUTS_MS } from '../dto/telecom.request.dto';
import type { TelecomCallMeta } from '../telecom.service.interface';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../../presence/presence.service';

/** Phase 10/12 — browser presence via JWT; delegates to shared PresenceService. */
@Injectable()
export class BrowserPresenceService {
  private readonly logger = new Logger(BrowserPresenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async updateFromBrowser(
    user: JwtPayload,
    dto: PresenceRequestDto,
    meta: TelecomCallMeta,
  ): Promise<PresenceResponseDto> {
    if (!this.prisma.connected) {
      return {
        accepted: true,
        placeholder: true,
        timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.presence,
        platformUuid: meta.platformUuid,
      };
    }

    const device = await this.prisma.device.findFirst({
      where: {
        tenantId: user.tenantId,
        userId: user.sub,
        deletedAt: null,
        deviceType: DeviceType.WEBRTC,
        lineId: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!device?.lineId) {
      throw new NotFoundException('WEBRTC device with Line required for presence');
    }

    await this.presence.setLinePresence({
      tenantId: user.tenantId,
      lineId: device.lineId,
      deviceId: device.id,
      status: mapBrowserStatus(dto.status),
      source: 'browser',
      customMessage: dto.note ?? null,
      skipOverride: false,
    });

    this.logger.log(
      JSON.stringify({
        event: 'telecom.presence.browser',
        lineId: device.lineId,
        status: dto.status,
        userId: user.sub,
      }),
    );

    return {
      accepted: true,
      placeholder: false,
      timeoutGuidanceMs: TELECOM_TIMEOUTS_MS.presence,
      platformUuid: meta.platformUuid,
    };
  }
}

function mapBrowserStatus(status: PresenceRequestDto['status']): PresenceStatus {
  switch (status) {
    case 'OPEN':
      return PresenceStatus.AVAILABLE;
    case 'BUSY':
      return PresenceStatus.BUSY;
    case 'AWAY':
      return PresenceStatus.AWAY;
    case 'CLOSED':
      return PresenceStatus.OFFLINE;
    default:
      return PresenceStatus.OFFLINE;
  }
}
