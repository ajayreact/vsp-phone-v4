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
      include: {
        line: true,
        devices: { where: { deletedAt: null }, take: 5 },
      },
    });
    const lineId = endpoint?.line?.id ?? endpoint?.devices.find((d) => d.lineId)?.lineId;
    if (!endpoint || !lineId) {
      throw new NotFoundException('Line not found for AoR');
    }
    const deviceId =
      dto.deviceId ??
      endpoint.devices.find((d) => d.id === dto.deviceId)?.id ??
      endpoint.devices[0]?.id;
    await this.presence.setLinePresence({
      tenantId: endpoint.tenantId,
      lineId,
      deviceId,
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
