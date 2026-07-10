import { Injectable, NotFoundException } from '@nestjs/common';
import { DeviceTemplateKind, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  CreateProvisioningTemplateDto,
  UpdateProvisioningTemplateDto,
} from '../dto/tenant-provisioning.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { tenantScope } from '../utils/tenant.util';

const templateInclude = {
  _count: { select: { devices: true } },
} as const;

@Injectable()
export class TenantProvisioningTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.provisioningTemplate.findMany({
      where: tenantScope(tenantId),
      include: templateInclude,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.provisioningTemplate.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: templateInclude,
    });
    if (!row) throw new NotFoundException('Provisioning template not found');
    return row;
  }

  async create(tenantId: string, userId: string, dto: CreateProvisioningTemplateDto) {
    if (dto.isDefault) {
      await this.clearDefault(tenantId, dto.manufacturer);
    }

    const template = await this.prisma.provisioningTemplate.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: dto.name,
        description: dto.description,
        templateKind: dto.templateKind ?? DeviceTemplateKind.CUSTOM,
        manufacturer: dto.manufacturer,
        modelFamily: dto.modelFamily,
        firmwareChannel: dto.firmwareChannel,
        isDefault: dto.isDefault ?? false,
        config: dto.config as Prisma.InputJsonValue,
        createdBy: userId,
      },
      include: templateInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.provisioning_template.create',
      entityType: 'ProvisioningTemplate',
      entityId: template.id,
      metadata: { name: dto.name, manufacturer: dto.manufacturer },
    });

    return template;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateProvisioningTemplateDto) {
    await this.getById(tenantId, id);

    if (dto.isDefault && dto.manufacturer) {
      await this.clearDefault(tenantId, dto.manufacturer);
    }

    const template = await this.prisma.provisioningTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        templateKind: dto.templateKind,
        manufacturer: dto.manufacturer,
        modelFamily: dto.modelFamily,
        firmwareChannel: dto.firmwareChannel,
        isDefault: dto.isDefault,
        config: dto.config as Prisma.InputJsonValue,
        version: { increment: 1 },
        updatedBy: userId,
      },
      include: templateInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.provisioning_template.update',
      entityType: 'ProvisioningTemplate',
      entityId: id,
      metadata: dto as Record<string, unknown>,
    });

    return template;
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.getById(tenantId, id);
    await this.prisma.provisioningTemplate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.provisioning_template.delete',
      entityType: 'ProvisioningTemplate',
      entityId: id,
    });
    return { ok: true };
  }

  defaultConfigForKind(kind: DeviceTemplateKind): Record<string, unknown> {
    const base = {
      codecPriority: ['opus', 'g722', 'pcmu', 'pcma'],
      dtmfMode: 'rfc4733',
      natTraversal: true,
      voicemailSubscribe: true,
    };
    switch (kind) {
      case DeviceTemplateKind.RECEPTION:
        return { ...base, ringTimeout: 30, callWaiting: true, blfSlots: 20 };
      case DeviceTemplateKind.CONFERENCE_ROOM:
        return { ...base, ringTimeout: 0, autoAnswer: true, speakerphone: true };
      case DeviceTemplateKind.EXECUTIVE:
        return { ...base, ringTimeout: 18, callWaiting: true, privacy: true };
      case DeviceTemplateKind.WAREHOUSE:
        return { ...base, ringTimeout: 45, loudRing: true, headsetMode: false };
      case DeviceTemplateKind.CALL_CENTER:
        return { ...base, ringTimeout: 10, agentMode: true, wrapUpSec: 30 };
      case DeviceTemplateKind.OFFICE:
        return { ...base, ringTimeout: 25, callWaiting: true };
      default:
        return base;
    }
  }

  private async clearDefault(tenantId: string, manufacturer: CreateProvisioningTemplateDto['manufacturer']) {
    await this.prisma.provisioningTemplate.updateMany({
      where: { tenantId, manufacturer, isDefault: true, deletedAt: null },
      data: { isDefault: false },
    });
  }
}
