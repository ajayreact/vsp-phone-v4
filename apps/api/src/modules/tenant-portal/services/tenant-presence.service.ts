import { Injectable, NotFoundException } from '@nestjs/common';
import { PresenceStatus, Prisma } from '@prisma/client';
import { PresenceService } from '../../presence/presence.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type { SearchPresenceDto, SetLinePresenceDto } from '../dto/tenant-presence.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { tenantScope } from '../utils/tenant.util';

const lineInclude = {
  user: { include: { profile: true } },
  extension: true,
  presence: true,
  telephonySettings: true,
  devices: { where: { deletedAt: null }, take: 3, select: { id: true, name: true, status: true } },
} satisfies Prisma.LineInclude;

@Injectable()
export class TenantPresenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string, query?: SearchPresenceDto) {
    if (!this.prisma.connected) return [];

    const where: Prisma.LineWhereInput = { ...tenantScope(tenantId), status: 'ACTIVE' };
    if (query?.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { profile: { displayName: { contains: q, mode: 'insensitive' } } } },
        { extension: { extension: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const lines = await this.prisma.line.findMany({
      where,
      include: lineInclude,
      orderBy: { name: 'asc' },
      take: 500,
    });

    let rows = lines.map((line) => this.mapLinePresence(line));
    if (query?.status) {
      rows = rows.filter((r) => r.status === query.status);
    }
    if (query?.departmentId) {
      rows = rows.filter((r) => r.department === query.departmentId);
    }
    return rows;
  }

  async getByLineId(tenantId: string, lineId: string) {
    const line = await this.prisma.line.findFirst({
      where: { id: lineId, ...tenantScope(tenantId) },
      include: lineInclude,
    });
    if (!line) return null;
    return this.mapLinePresence(line);
  }

  async setManual(tenantId: string, userId: string, lineId: string, dto: SetLinePresenceDto) {
    const line = await this.prisma.line.findFirst({ where: { id: lineId, tenantId, deletedAt: null } });
    if (!line) throw new NotFoundException('Line not found');

    await this.presence.setAdminOverride({
      tenantId,
      lineId,
      status: dto.status,
      customMessage: dto.customMessage,
      userId,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.presence.set',
      entityType: 'Presence',
      entityId: lineId,
      metadata: { status: dto.status, customMessage: dto.customMessage },
    });

    return this.getByLineId(tenantId, lineId);
  }

  async getReports(tenantId: string) {
    if (!this.prisma.connected) {
      return { total: 0, byStatus: {}, onCall: 0, dnd: 0, offline: 0 };
    }
    const presences = await this.prisma.presence.findMany({
      where: { tenantId, deletedAt: null },
      select: { status: true },
    });
    const byStatus: Record<string, number> = {};
    for (const p of presences) {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    }
    return {
      total: presences.length,
      byStatus,
      onCall: byStatus[PresenceStatus.ON_CALL] ?? 0,
      dnd: byStatus[PresenceStatus.DND] ?? 0,
      offline: byStatus[PresenceStatus.OFFLINE] ?? 0,
    };
  }

  private mapLinePresence(line: Prisma.LineGetPayload<{ include: typeof lineInclude }>) {
    const ext = line.extension?.extension ?? null;
    const profile = line.user?.profile;
    const settings = line.telephonySettings;
    const status = line.presence?.status ?? PresenceStatus.OFFLINE;
    return {
      lineId: line.id,
      lineName: line.name,
      extension: ext,
      displayName: profile?.displayName ?? line.name,
      email: line.user?.email ?? null,
      department: null,
      title: null,
      status,
      customMessage: line.presence?.customMessage ?? null,
      source: 'line',
      forwarded: settings?.callForwardEnabled ?? false,
      dndEnabled: settings?.dndEnabled ?? false,
      devicesOnline: line.devices.filter((d) => d.status === 'ONLINE').length,
      updatedAt: line.presence?.updatedAt?.toISOString() ?? null,
    };
  }
}
