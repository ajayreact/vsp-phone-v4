import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LineStatus, Prisma, SIPEndpointStatus, type SIPEndpoint } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { newPublicId } from '../utils/tenant.util';

type DbClient = Prisma.TransactionClient | PrismaService;

export type ResolveLineSipEndpointParams = {
  tenantId: string;
  lineId: string;
  actorUserId?: string;
};

/** Resolves or creates the single Line-owned SIPEndpoint (shared by all devices). */
@Injectable()
export class LineSipEndpointService {
  private readonly platformDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.platformDomain = config.get<string>('SIP_PLATFORM_DOMAIN', 'vsp.internal');
  }

  buildAor(tenantSlug: string, extension: string): string {
    const realm = `${tenantSlug}.sip.${this.platformDomain}`;
    return `sip:${extension}@${realm}`;
  }

  async resolveOrCreateForLine(
    params: ResolveLineSipEndpointParams,
    client: DbClient = this.prisma,
  ): Promise<SIPEndpoint> {
    const lineInclude = {
      extension: true,
      tenant: { select: { slug: true } },
      sipEndpoint: true,
    } as const;

    let line = await client.line.findFirst({
      where: { id: params.lineId, tenantId: params.tenantId },
      include: lineInclude,
    });
    if (!line?.extension) {
      throw new NotFoundException('Line with extension required');
    }
    if (line.deletedAt) {
      line = await client.line.update({
        where: { id: line.id },
        data: {
          deletedAt: null,
          deletedBy: null,
          status: LineStatus.ACTIVE,
          updatedBy: params.actorUserId,
        },
        include: lineInclude,
      });
    }

    if (line.sipEndpoint && !line.sipEndpoint.deletedAt) {
      return line.sipEndpoint;
    }

    if (line.sipEndpointId) {
      const byId = await client.sIPEndpoint.findFirst({
        where: { id: line.sipEndpointId, tenantId: params.tenantId, deletedAt: null },
      });
      if (byId) return byId;
    }

    const aor = this.buildAor(line.tenant.slug, line.extension.extension);
    const existingByAor = await client.sIPEndpoint.findFirst({
      where: { tenantId: params.tenantId, aor, deletedAt: null },
    });
    if (existingByAor) {
      await client.line.update({
        where: { id: line.id },
        data: { sipEndpointId: existingByAor.id, updatedBy: params.actorUserId },
      });
      return existingByAor;
    }

    const fromDevice = await client.device.findFirst({
      where: {
        lineId: line.id,
        tenantId: params.tenantId,
        deletedAt: null,
        sipEndpointId: { not: null },
      },
      include: { sipEndpoint: true },
      orderBy: { createdAt: 'asc' },
    });
    if (fromDevice?.sipEndpoint && !fromDevice.sipEndpoint.deletedAt) {
      await client.line.update({
        where: { id: line.id },
        data: { sipEndpointId: fromDevice.sipEndpoint.id, updatedBy: params.actorUserId },
      });
      return fromDevice.sipEndpoint;
    }

    const sipEndpointId = randomUUID();
    const created = await client.sIPEndpoint.create({
      data: {
        id: sipEndpointId,
        publicId: newPublicId('sip'),
        tenantId: params.tenantId,
        aor,
        authUsername: line.extension.extension,
        registrationStatus: SIPEndpointStatus.UNREGISTERED,
        createdBy: params.actorUserId,
      },
    });

    await client.line.update({
      where: { id: line.id },
      data: { sipEndpointId: created.id, updatedBy: params.actorUserId },
    });

    return created;
  }
}
