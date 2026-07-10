import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RecordingPolicyMode } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type { CreateRecordingPolicyDto, UpdateRecordingPolicyDto } from '../dto/tenant-recording-policies.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { tenantScope } from '../utils/tenant.util';

const policyInclude = {
  line: { select: { id: true, name: true } },
} satisfies Prisma.RecordingPolicyInclude;

@Injectable()
export class TenantRecordingPoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.recordingPolicy.findMany({
      where: tenantScope(tenantId),
      include: policyInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.recordingPolicy.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: policyInclude,
    });
    if (!row) throw new NotFoundException('Recording policy not found');
    return row;
  }

  async getByLineId(tenantId: string, lineId: string) {
    const row = await this.prisma.recordingPolicy.findFirst({
      where: { tenantId, lineId, deletedAt: null },
      include: policyInclude,
    });
    if (!row) throw new NotFoundException('Recording policy not found for line');
    return row;
  }

  async create(tenantId: string, userId: string, dto: CreateRecordingPolicyDto) {
    if (dto.lineId) {
      const line = await this.prisma.line.findFirst({ where: { id: dto.lineId, tenantId, deletedAt: null } });
      if (!line) throw new NotFoundException('Line not found');
    }

    const policy = await this.prisma.recordingPolicy.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: dto.name,
        lineId: dto.lineId,
        queueId: dto.queueId,
        ivrId: dto.ivrId,
        policyMode: dto.policyMode ?? RecordingPolicyMode.ON_DEMAND,
        recordingEnabled: dto.recordingEnabled ?? false,
        recordInbound: dto.recordInbound ?? false,
        recordOutbound: dto.recordOutbound ?? false,
        retentionDays: dto.retentionDays,
        archiveAfterDays: dto.archiveAfterDays,
        legalHoldDefault: dto.legalHoldDefault ?? false,
        pauseAllowed: dto.pauseAllowed ?? true,
        createdBy: userId,
      },
      include: policyInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.recording_policy.create',
      entityType: 'RecordingPolicy',
      entityId: policy.id,
    });

    return policy;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateRecordingPolicyDto) {
    await this.getById(tenantId, id);

    const policy = await this.prisma.recordingPolicy.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.policyMode !== undefined ? { policyMode: dto.policyMode } : {}),
        ...(dto.recordingEnabled !== undefined ? { recordingEnabled: dto.recordingEnabled } : {}),
        ...(dto.recordInbound !== undefined ? { recordInbound: dto.recordInbound } : {}),
        ...(dto.recordOutbound !== undefined ? { recordOutbound: dto.recordOutbound } : {}),
        ...(dto.retentionDays !== undefined ? { retentionDays: dto.retentionDays } : {}),
        ...(dto.archiveAfterDays !== undefined ? { archiveAfterDays: dto.archiveAfterDays } : {}),
        ...(dto.legalHoldDefault !== undefined ? { legalHoldDefault: dto.legalHoldDefault } : {}),
        ...(dto.pauseAllowed !== undefined ? { pauseAllowed: dto.pauseAllowed } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: policyInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.recording_policy.update',
      entityType: 'RecordingPolicy',
      entityId: policy.id,
    });

    return policy;
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.getById(tenantId, id);
    const policy = await this.prisma.recordingPolicy.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.recording_policy.delete',
      entityType: 'RecordingPolicy',
      entityId: policy.id,
    });

    return policy;
  }
}
