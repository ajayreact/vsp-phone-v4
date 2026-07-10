import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  BulkImportExtensionsDto,
  CreateExtensionDto,
  UpdateExtensionDto,
} from '../dto/tenant-extensions.dto';
import { TenantLinesService } from './tenant-lines.service';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { tenantScope } from '../utils/tenant.util';

const extensionInclude = {
  line: {
    include: {
      user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true, displayName: true } } } },
      presence: true,
      callerId: { include: { phoneNumber: { select: { id: true, number: true } } } },
      telephonySettings: true,
      voicemail: { select: { id: true, status: true, pin: true } },
      callPolicy: true,
      recordingPolicy: true,
    },
  },
} as const;

@Injectable()
export class TenantExtensionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lines: TenantLinesService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string, search?: string) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.OR = [
        { extension: { contains: search.trim(), mode: 'insensitive' } },
        { line: { name: { contains: search.trim(), mode: 'insensitive' } } },
      ];
    }

    return this.prisma.extension.findMany({
      where,
      include: extensionInclude,
      orderBy: { extension: 'asc' },
      take: 1000,
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.extension.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: extensionInclude,
    });
    if (!row) throw new NotFoundException('Extension not found');
    return row;
  }

  async create(tenantId: string, userId: string, dto: CreateExtensionDto) {
    let lineId = dto.lineId;

    if (!lineId) {
      if (!dto.userId) {
        throw new BadRequestException('Either lineId or userId is required');
      }
      const line = await this.lines.create(tenantId, userId, {
        userId: dto.userId,
        name: dto.lineName ?? `Extension ${dto.extension}`,
        callerIdName: dto.callerIdName,
        phoneNumberId: dto.phoneNumberId,
        emergencyCallerIdName: dto.emergencyCallerIdName,
        settings: dto.settings,
      });
      lineId = line.id;
    } else if (dto.settings || dto.callerIdName || dto.emergencyCallerIdName || dto.phoneNumberId) {
      await this.lines.update(tenantId, userId, lineId, {
        callerIdName: dto.callerIdName,
        phoneNumberId: dto.phoneNumberId,
        emergencyCallerIdName: dto.emergencyCallerIdName,
        settings: dto.settings,
      });
    }

    const existingExt = await this.prisma.extension.findFirst({
      where: { lineId, tenantId, deletedAt: null },
    });
    if (existingExt) {
      throw new BadRequestException('Line already has an extension');
    }

    const extension = await this.prisma.extension.create({
      data: {
        id: randomUUID(),
        tenantId,
        lineId,
        extension: dto.extension,
        createdBy: userId,
      },
      include: extensionInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.extension.create',
      entityType: 'Extension',
      entityId: extension.id,
      metadata: { extension: dto.extension, lineId },
    });

    return extension;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateExtensionDto) {
    const existing = await this.require(tenantId, id);

    if (dto.extension !== undefined) {
      await this.prisma.extension.update({
        where: { id: existing.id },
        data: { extension: dto.extension, updatedBy: userId, version: { increment: 1 } },
      });
    }

    if (dto.callerIdName !== undefined || dto.phoneNumberId !== undefined || dto.emergencyCallerIdName !== undefined || dto.settings) {
      await this.lines.update(tenantId, userId, existing.lineId, {
        callerIdName: dto.callerIdName,
        phoneNumberId: dto.phoneNumberId,
        emergencyCallerIdName: dto.emergencyCallerIdName,
        settings: dto.settings,
      });
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.extension.update',
      entityType: 'Extension',
      entityId: id,
    });

    return this.getById(tenantId, id);
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.require(tenantId, id);
    await this.prisma.extension.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.extension.delete',
      entityType: 'Extension',
      entityId: id,
    });

    return { ok: true };
  }

  async bulkImport(tenantId: string, userId: string, dto: BulkImportExtensionsDto) {
    const results: { extension: string; ok: boolean; error?: string }[] = [];

    for (const row of dto.rows) {
      try {
        await this.create(tenantId, userId, {
          userId: row.userId,
          extension: row.extension,
          lineName: row.lineName,
          callerIdName: row.callerIdName,
        });
        results.push({ extension: row.extension, ok: true });
      } catch (e) {
        results.push({
          extension: row.extension,
          ok: false,
          error: e instanceof Error ? e.message : 'Failed',
        });
      }
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.extension.bulk_import',
      entityType: 'Extension',
      entityId: tenantId,
      metadata: { count: dto.rows.length, success: results.filter((r) => r.ok).length },
    });

    return { results };
  }

  async exportCsvAsync(tenantId: string): Promise<string> {
    const rows = await this.list(tenantId);
    const header = 'extension,userId,userEmail,lineName,callerIdName,presence,forwardEnabled,forwardDestination,dnd';
    const lines = rows.map((r) => {
      const line = r.line;
      const user = line.user;
      const email = user?.email ?? '';
      const settings = line.telephonySettings;
      return [
        r.extension,
        line.userId,
        email,
        line.name,
        line.callerId?.callerIdName ?? '',
        line.presence?.status ?? '',
        settings?.callForwardEnabled ? 'true' : 'false',
        settings?.callForwardDestination ?? '',
        settings?.dndEnabled ? 'true' : 'false',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    return [header, ...lines].join('\n');
  }

  private async require(tenantId: string, id: string) {
    const row = await this.prisma.extension.findFirst({
      where: { id, ...tenantScope(tenantId) },
    });
    if (!row) throw new NotFoundException('Extension not found');
    return row;
  }
}

export type { CreateExtensionDto, UpdateExtensionDto, BulkImportExtensionsDto };
