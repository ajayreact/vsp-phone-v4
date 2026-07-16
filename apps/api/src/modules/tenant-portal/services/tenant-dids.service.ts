import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RouteDestinationType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type { AssignDidDto } from '../dto/tenant-dids.dto';
import {
  assertCanBindDidToLine,
  markLineActiveOnDidAttach,
} from '../utils/did-extension-binding';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { tenantScope } from '../utils/tenant.util';

const didInclude = {
  line: {
    select: {
      id: true,
      name: true,
      extension: { select: { id: true, extension: true } },
      user: {
        select: {
          id: true,
          email: true,
          profile: { select: { firstName: true, lastName: true, displayName: true } },
        },
      },
    },
  },
  carrier: { select: { id: true, name: true, code: true } },
  site: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TenantDidsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string, search?: string) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.number = { contains: search.trim() };
    }

    const numbers = await this.prisma.phoneNumber.findMany({
      where,
      include: didInclude,
      orderBy: { number: 'asc' },
      take: 500,
    });

    const routes = await this.prisma.inboundRoute.findMany({
      where: { ...tenantScope(tenantId), phoneNumberId: { not: null }, deletedAt: null },
      orderBy: { priority: 'asc' },
      take: 500,
    });

    const routeByDid = new Map<string, (typeof routes)[number]>();
    for (const route of routes) {
      if (route.phoneNumberId && !routeByDid.has(route.phoneNumberId)) {
        routeByDid.set(route.phoneNumberId, route);
      }
    }

    return numbers.map((n) => ({
      ...n,
      routing: routeByDid.get(n.id) ?? null,
      routed: Boolean(routeByDid.get(n.id) ?? n.lineId),
    }));
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.phoneNumber.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: didInclude,
    });
    if (!row) throw new NotFoundException('Phone number not found');

    const routing = await this.prisma.inboundRoute.findFirst({
      where: { tenantId, phoneNumberId: id, deletedAt: null },
      orderBy: { priority: 'asc' },
    });

    const history = await this.prisma.numberAssignment.findMany({
      where: { tenantId, phoneNumberId: id, deletedAt: null },
      orderBy: { effectiveFrom: 'desc' },
      take: 50,
      include: {
        line: {
          select: {
            id: true,
            name: true,
            extension: { select: { extension: true } },
          },
        },
      },
    });

    return { ...row, routing, history };
  }

  async listDestinations(tenantId: string, type: RouteDestinationType) {
    if (!this.prisma.connected) return [];

    switch (type) {
      case RouteDestinationType.EXTENSION: {
        const exts = await this.prisma.extension.findMany({
          where: { ...tenantScope(tenantId), deletedAt: null },
          include: {
            line: {
              select: {
                name: true,
                user: {
                  select: {
                    email: true,
                    profile: { select: { displayName: true, firstName: true, lastName: true } },
                  },
                },
              },
            },
          },
          orderBy: { extension: 'asc' },
          take: 500,
        });
        return exts.map((ext) => {
          const user = ext.line?.user;
          const display =
            user?.profile?.displayName ??
            (user?.profile?.firstName
              ? `${user.profile.firstName} ${user.profile.lastName ?? ''}`.trim()
              : user?.email ?? ext.line?.name ?? ext.extension);
          return {
            id: ext.id,
            label: `${ext.extension} — ${display}`,
            extension: ext.extension,
          };
        });
      }
      case RouteDestinationType.LINE: {
        const lines = await this.prisma.line.findMany({
          where: { ...tenantScope(tenantId), deletedAt: null },
          include: {
            extension: { select: { id: true, extension: true } },
            user: {
              select: {
                id: true,
                email: true,
                profile: { select: { displayName: true, firstName: true, lastName: true } },
              },
            },
          },
          orderBy: { name: 'asc' },
          take: 500,
        });
        return lines.map((line) => {
          const user = line.user;
          const display =
            user?.profile?.displayName ??
            (user?.profile?.firstName
              ? `${user.profile.firstName} ${user.profile.lastName ?? ''}`.trim()
              : user?.email ?? line.name);
          const ext = line.extension?.extension;
          return {
            id: line.id,
            label: ext ? `${ext} — ${display}` : display,
            extension: ext ?? null,
            userId: user?.id ?? null,
          };
        });
      }
      case RouteDestinationType.QUEUE: {
        const rows = await this.prisma.queue.findMany({
          where: { ...tenantScope(tenantId), deletedAt: null },
          select: { id: true, name: true, code: true },
          orderBy: { name: 'asc' },
          take: 200,
        });
        return rows.map((r) => ({ id: r.id, label: r.name, code: r.code }));
      }
      case RouteDestinationType.IVR: {
        const rows = await this.prisma.iVR.findMany({
          where: { ...tenantScope(tenantId), deletedAt: null },
          select: { id: true, name: true, extension: true },
          orderBy: { name: 'asc' },
          take: 200,
        });
        return rows.map((r) => ({
          id: r.id,
          label: r.extension ? `${r.extension} — ${r.name}` : r.name,
        }));
      }
      case RouteDestinationType.RING_GROUP: {
        const rows = await this.prisma.ringGroup.findMany({
          where: { ...tenantScope(tenantId), deletedAt: null },
          select: { id: true, name: true, extension: true },
          orderBy: { name: 'asc' },
          take: 200,
        });
        return rows.map((r) => ({
          id: r.id,
          label: r.extension ? `${r.extension} — ${r.name}` : r.name,
        }));
      }
      case RouteDestinationType.VOICEMAIL: {
        const rows = await this.prisma.voicemail.findMany({
          where: { ...tenantScope(tenantId), deletedAt: null },
          select: {
            id: true,
            line: {
              select: {
                name: true,
                extension: { select: { extension: true } },
              },
            },
          },
          take: 200,
        });
        return rows.map((r) => ({
          id: r.id,
          label: r.line?.extension?.extension
            ? `VM ${r.line.extension.extension}`
            : r.line?.name ?? r.id,
        }));
      }
      case RouteDestinationType.CONFERENCE: {
        const rows = await this.prisma.conference.findMany({
          where: { ...tenantScope(tenantId), deletedAt: null },
          select: { id: true, name: true, code: true },
          orderBy: { name: 'asc' },
          take: 200,
        });
        return rows.map((r) => ({ id: r.id, label: `${r.name} (${r.code})`, code: r.code }));
      }
      default:
        return [];
    }
  }

  async assign(tenantId: string, userId: string, phoneNumberId: string, dto: AssignDidDto) {
    const phone = await this.prisma.phoneNumber.findFirst({
      where: { id: phoneNumberId, ...tenantScope(tenantId) },
    });
    if (!phone) throw new NotFoundException('Phone number not found');

    await this.prisma.$transaction((tx) =>
      this.assignInTransaction(tx, tenantId, userId, phoneNumberId, dto),
    );

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.did.assign',
      entityType: 'PhoneNumber',
      entityId: phoneNumberId,
      metadata: {
        number: phone.number,
        destinationType: dto.destinationType,
        destinationId: dto.destinationId,
      },
    });

    return this.getById(tenantId, phoneNumberId);
  }

  async assignInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    phoneNumberId: string,
    dto: AssignDidDto,
  ) {
    const phone = await tx.phoneNumber.findFirst({
      where: { id: phoneNumberId, ...tenantScope(tenantId) },
    });
    if (!phone) throw new NotFoundException('Phone number not found');

    const resolved = await this.resolveDestination(tx, tenantId, dto.destinationType, dto.destinationId);

    // Extension destinations enforce One DID ↔ One Extension.
    if (resolved.destinationLineId && resolved.destinationExtensionId) {
      await assertCanBindDidToLine(tx, {
        tenantId,
        phoneNumberId,
        lineId: resolved.destinationLineId,
      });
    }

    const existing = await tx.inboundRoute.findFirst({
      where: { tenantId, phoneNumberId, deletedAt: null },
      orderBy: { priority: 'asc' },
    });

    const routeData = {
      destinationType: resolved.destinationType,
      destinationLineId: resolved.destinationLineId,
      destinationExtensionId: resolved.destinationExtensionId,
      destinationQueueId: resolved.destinationQueueId,
      destinationIvrId: resolved.destinationIvrId,
      destinationRingGroupId: resolved.destinationRingGroupId,
      destinationVoicemailId: resolved.destinationVoicemailId,
      destinationConferenceId: resolved.destinationConferenceId,
      openHoursDestinationType: null,
      openHoursDestinationId: null,
      enabled: true,
      updatedBy: userId,
    };

    if (existing) {
      await tx.inboundRoute.update({ where: { id: existing.id }, data: routeData });
    } else {
      await tx.inboundRoute.create({
        data: {
          id: randomUUID(),
          tenantId,
          name: `DID ${phone.number}`,
          phoneNumberId,
          priority: 100,
          enabled: true,
          createdBy: userId,
          ...routeData,
        },
      });
    }

    await tx.phoneNumber.update({
      where: { id: phoneNumberId },
      data: {
        lineId: resolved.destinationLineId ?? null,
        siteId: dto.siteId ?? phone.siteId,
        updatedBy: userId,
      },
    });
    if (resolved.destinationLineId) {
      await markLineActiveOnDidAttach(tx, resolved.destinationLineId, userId);
    }

    if (resolved.destinationLineId && dto.callerIdName?.trim()) {
      const line = await tx.line.findFirst({
        where: { id: resolved.destinationLineId, tenantId },
      });
      if (line) {
        const existingCallerId = await tx.callerID.findFirst({
          where: { tenantId, lineId: line.id, deletedAt: null },
        });
        if (existingCallerId) {
          await tx.callerID.update({
            where: { id: existingCallerId.id },
            data: { callerIdName: dto.callerIdName.trim(), phoneNumberId, updatedBy: userId },
          });
        } else {
          await tx.callerID.create({
            data: {
              id: randomUUID(),
              tenantId,
              lineId: line.id,
              phoneNumberId,
              callerIdName: dto.callerIdName.trim(),
              createdBy: userId,
              updatedBy: userId,
            },
          });
        }
      }
    }

    await tx.numberAssignment.updateMany({
      where: { tenantId, phoneNumberId, effectiveTo: null, deletedAt: null },
      data: { effectiveTo: new Date(), updatedBy: userId },
    });

    await tx.numberAssignment.create({
      data: {
        id: randomUUID(),
        tenantId,
        phoneNumberId,
        lineId: resolved.destinationLineId,
        siteId: dto.siteId ?? phone.siteId,
        effectiveFrom: new Date(),
        createdBy: userId,
        updatedBy: userId,
      },
    });

    const routing = await tx.inboundRoute.findFirst({
      where: { tenantId, phoneNumberId, deletedAt: null },
      orderBy: { priority: 'asc' },
    });

    return { phoneNumberId, routing };
  }

  private async resolveDestination(
    db: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    type: RouteDestinationType,
    destinationId: string,
  ) {
    const empty = {
      destinationType: type,
      destinationLineId: null as string | null,
      destinationExtensionId: null as string | null,
      destinationQueueId: null as string | null,
      destinationIvrId: null as string | null,
      destinationRingGroupId: null as string | null,
      destinationVoicemailId: null as string | null,
      destinationConferenceId: null as string | null,
    };

    if (type === RouteDestinationType.EXTENSION) {
      const ext = await db.extension.findFirst({
        where: { id: destinationId, ...tenantScope(tenantId), deletedAt: null },
      });
      if (!ext) throw new BadRequestException('Extension not found');
      return {
        ...empty,
        destinationType: RouteDestinationType.EXTENSION,
        destinationExtensionId: ext.id,
        destinationLineId: ext.lineId,
      };
    }

    if (type === RouteDestinationType.LINE) {
      const line = await db.line.findFirst({
        where: { id: destinationId, ...tenantScope(tenantId), deletedAt: null },
      });
      if (!line) throw new BadRequestException('Line not found');
      return { ...empty, destinationType: RouteDestinationType.LINE, destinationLineId: line.id };
    }

    if (type === RouteDestinationType.QUEUE) {
      const row = await db.queue.findFirst({
        where: { id: destinationId, ...tenantScope(tenantId), deletedAt: null },
      });
      if (!row) throw new BadRequestException('Queue not found');
      return { ...empty, destinationQueueId: row.id };
    }

    if (type === RouteDestinationType.IVR) {
      const row = await db.iVR.findFirst({
        where: { id: destinationId, ...tenantScope(tenantId), deletedAt: null },
      });
      if (!row) throw new BadRequestException('IVR not found');
      return { ...empty, destinationIvrId: row.id };
    }

    if (type === RouteDestinationType.RING_GROUP) {
      const row = await db.ringGroup.findFirst({
        where: { id: destinationId, ...tenantScope(tenantId), deletedAt: null },
      });
      if (!row) throw new BadRequestException('Ring group not found');
      return { ...empty, destinationRingGroupId: row.id };
    }

    if (type === RouteDestinationType.VOICEMAIL) {
      const row = await db.voicemail.findFirst({
        where: { id: destinationId, ...tenantScope(tenantId), deletedAt: null },
      });
      if (!row) throw new BadRequestException('Voicemail not found');
      return { ...empty, destinationVoicemailId: row.id };
    }

    if (type === RouteDestinationType.CONFERENCE) {
      const row = await db.conference.findFirst({
        where: { id: destinationId, ...tenantScope(tenantId), deletedAt: null },
      });
      if (!row) throw new BadRequestException('Conference not found');
      return { ...empty, destinationConferenceId: row.id };
    }

    throw new BadRequestException(`Unsupported destination type: ${type}`);
  }
}
