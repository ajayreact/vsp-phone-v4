import { BadRequestException, Injectable } from '@nestjs/common';
import { DeviceStatus, SIPEndpointStatus } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type ExtensionAdminRecord = {
  id: string;
  extension: string;
  userId: string | null;
  userDisplayName: string | null;
  tenantId: string;
  tenantName: string;
  department: string | null;
  deviceId: string | null;
  deviceLabel: string | null;
  registration: 'online' | 'offline' | 'unknown';
  presence: string;
  voicemailEnabled: boolean;
  callForward: string | null;
  dnd: boolean;
  callerId: string | null;
  lastRegistrationAt: string | null;
  codec: string | null;
};

@Injectable()
export class ExtensionsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { tenantId?: string; search?: string }): Promise<ExtensionAdminRecord[]> {
    if (!this.prisma.connected) return [];
    if (!params.tenantId) {
      throw new BadRequestException('tenantId is required for extension listing');
    }

    const where: Record<string, unknown> = { deletedAt: null, tenantId: params.tenantId };
    if (params.search?.trim()) {
      where.OR = [
        { extension: { contains: params.search.trim(), mode: 'insensitive' } },
        { line: { name: { contains: params.search.trim(), mode: 'insensitive' } } },
        { line: { user: { email: { contains: params.search.trim(), mode: 'insensitive' } } } },
      ];
    }

    const rows = await this.prisma.extension.findMany({
      where,
      include: {
        tenant: { select: { id: true, name: true } },
        line: {
          include: {
            user: { include: { profile: true } },
            presence: true,
            callerId: { include: { phoneNumber: true } },
            voicemail: true,
            devices: {
              where: { deletedAt: null },
              take: 1,
              include: { sipEndpoint: true },
            },
          },
        },
      },
      orderBy: { extension: 'asc' },
      take: 500,
    });

    return rows.map((r) => {
      const device = r.line.devices[0];
      const sip = device?.sipEndpoint;
      const presence = r.line.presence?.status ?? 'OFFLINE';
      return {
        id: r.id,
        extension: r.extension,
        userId: r.line.userId,
        userDisplayName: r.line.user.profile?.displayName ?? r.line.name,
        tenantId: r.tenant.id,
        tenantName: r.tenant.name,
        department: null,
        deviceId: device?.id ?? null,
        deviceLabel: device?.name ?? null,
        registration:
          sip?.registrationStatus === SIPEndpointStatus.REGISTERED ||
          device?.status === DeviceStatus.ONLINE ||
          device?.status === DeviceStatus.REGISTERED ||
          device?.status === DeviceStatus.BUSY
            ? 'online'
            : sip?.registrationStatus === SIPEndpointStatus.UNREGISTERED
              ? 'offline'
              : 'unknown',
        presence,
        voicemailEnabled: Boolean(r.line.voicemail),
        callForward: null,
        dnd: presence === 'DND' || presence === 'BUSY',
        callerId: r.line.callerId?.phoneNumber?.number ?? null,
        lastRegistrationAt: sip?.lastRegisteredAt?.toISOString() ?? null,
        codec: (sip?.registrationConfig as Record<string, string> | null)?.codec ?? null,
      };
    });
  }
}
