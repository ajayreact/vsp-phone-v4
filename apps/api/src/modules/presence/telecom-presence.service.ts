import { Injectable, NotFoundException } from '@nestjs/common';
import { PresenceStatus } from '@prisma/client';
import type { PresenceRequestDto } from '../telecom/dto/telecom.request.dto';
import { PrismaService } from '../telecom/prisma/prisma.service';
import { PresenceService } from './presence.service';

/** Phase 12 — Kamailio/service-auth presence updates by AoR. */
@Injectable()
export class TelecomPresenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async updateFromTelecom(dto: PresenceRequestDto): Promise<void> {
    if (!this.prisma.connected) return;
    const aor = dto.aor.trim().toLowerCase().replace(/^<|>$/g, '');
    const endpoint = await this.prisma.sIPEndpoint.findFirst({
      where: {
        deletedAt: null,
        aor: { equals: aor, mode: 'insensitive' },
        ...(dto.tenantId ? { tenantId: dto.tenantId } : {}),
      },
      include: { device: true },
    });
    if (!endpoint?.device?.lineId) {
      throw new NotFoundException('Line not found for AoR');
    }
    await this.presence.setLinePresence({
      tenantId: endpoint.tenantId,
      lineId: endpoint.device.lineId,
      deviceId: dto.deviceId ?? endpoint.device.id,
      status: mapTelecomPresence(dto.status),
      source: 'device',
      customMessage: dto.note ?? null,
    });
  }
}

function mapTelecomPresence(status: PresenceRequestDto['status']): PresenceStatus {
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
