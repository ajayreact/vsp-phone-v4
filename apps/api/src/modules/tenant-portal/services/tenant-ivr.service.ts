import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  IvrFlowStatus,
  IvrInteractionEventType,
  IvrStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  BulkImportIvrsDto,
  CloneIvrDto,
  CreateIvrDto,
  PublishIvrDto,
  SaveIvrDraftDto,
  SimulateIvrDto,
  UpdateIvrDto,
} from '../dto/tenant-ivr.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { assertPhoneNumberBelongsToTenant, newPublicId, tenantScope } from '../utils/tenant.util';

const ivrInclude = {
  greetingAnnouncement: { select: { id: true, name: true, category: true } },
  phoneNumber: { select: { id: true, number: true } },
  timeCondition: { select: { id: true, name: true } },
  holidayCalendar: { select: { id: true, name: true } },
  flowVersions: { orderBy: { version: 'desc' }, take: 10 },
} satisfies Prisma.IVRInclude;

const DEFAULT_START_FLOW = {
  nodes: [
    { id: 'start', type: 'start', position: { x: 250, y: 50 }, data: { label: 'Start' } },
    { id: 'greeting', type: 'greeting', position: { x: 250, y: 180 }, data: { label: 'Greeting' } },
    { id: 'menu', type: 'menu', position: { x: 250, y: 320 }, data: { label: 'Main Menu', options: [] } },
  ],
  edges: [
    { id: 'e-start-greeting', source: 'start', target: 'greeting' },
    { id: 'e-greeting-menu', source: 'greeting', target: 'menu' },
  ],
  variables: {},
};

@Injectable()
export class TenantIvrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string, search?: string) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { code: { contains: search.trim(), mode: 'insensitive' } },
        { extension: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.iVR.findMany({
      where,
      include: ivrInclude,
      orderBy: { name: 'asc' },
      take: 500,
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.iVR.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: ivrInclude,
    });
    if (!row) throw new NotFoundException('IVR not found');
    return row;
  }

  async create(tenantId: string, userId: string, dto: CreateIvrDto) {
    const draftFlow = dto.draftFlow ?? DEFAULT_START_FLOW;
    await assertPhoneNumberBelongsToTenant(this.prisma, dto.phoneNumberId, tenantId);

    const ivr = await this.prisma.iVR.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('ivr'),
        tenantId,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        extension: dto.extension,
        phoneNumberId: dto.phoneNumberId,
        language: dto.language ?? 'en',
        status: dto.status ?? IvrStatus.ACTIVE,
        flowStatus: IvrFlowStatus.DRAFT,
        greetingAnnouncementId: dto.greetingAnnouncementId,
        timeoutSec: dto.timeoutSec ?? 10,
        invalidRetries: dto.invalidRetries ?? 3,
        invalidOptionDestinationType: dto.invalidOptionDestinationType,
        invalidOptionDestinationId: dto.invalidOptionDestinationId,
        recordingPolicyId: dto.recordingPolicyId,
        timeConditionId: dto.timeConditionId,
        holidayCalendarId: dto.holidayCalendarId,
        failoverDestinationType: dto.failoverDestinationType,
        failoverDestinationId: dto.failoverDestinationId,
        emergencyOverrideEnabled: dto.emergencyOverrideEnabled ?? false,
        draftFlowJson: draftFlow as Prisma.InputJsonValue,
        createdBy: userId,
      },
      include: ivrInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ivr.create',
      entityType: 'IVR',
      entityId: ivr.id,
      metadata: { name: dto.name, code: dto.code },
    });

    return ivr;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateIvrDto) {
    await this.require(tenantId, id);
    if (dto.phoneNumberId !== undefined) {
      await assertPhoneNumberBelongsToTenant(this.prisma, dto.phoneNumberId, tenantId);
    }

    const ivr = await this.prisma.iVR.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.extension !== undefined ? { extension: dto.extension } : {}),
        ...(dto.phoneNumberId !== undefined ? { phoneNumberId: dto.phoneNumberId } : {}),
        ...(dto.language !== undefined ? { language: dto.language } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.greetingAnnouncementId !== undefined ? { greetingAnnouncementId: dto.greetingAnnouncementId } : {}),
        ...(dto.timeoutSec !== undefined ? { timeoutSec: dto.timeoutSec } : {}),
        ...(dto.invalidRetries !== undefined ? { invalidRetries: dto.invalidRetries } : {}),
        ...(dto.invalidOptionDestinationType !== undefined ? { invalidOptionDestinationType: dto.invalidOptionDestinationType } : {}),
        ...(dto.invalidOptionDestinationId !== undefined ? { invalidOptionDestinationId: dto.invalidOptionDestinationId } : {}),
        ...(dto.recordingPolicyId !== undefined ? { recordingPolicyId: dto.recordingPolicyId } : {}),
        ...(dto.timeConditionId !== undefined ? { timeConditionId: dto.timeConditionId } : {}),
        ...(dto.holidayCalendarId !== undefined ? { holidayCalendarId: dto.holidayCalendarId } : {}),
        ...(dto.failoverDestinationType !== undefined ? { failoverDestinationType: dto.failoverDestinationType } : {}),
        ...(dto.failoverDestinationId !== undefined ? { failoverDestinationId: dto.failoverDestinationId } : {}),
        ...(dto.emergencyOverrideEnabled !== undefined ? { emergencyOverrideEnabled: dto.emergencyOverrideEnabled } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: ivrInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ivr.update',
      entityType: 'IVR',
      entityId: ivr.id,
      metadata: { ...dto },
    });

    return ivr;
  }

  async saveDraft(tenantId: string, userId: string, id: string, dto: SaveIvrDraftDto) {
    await this.require(tenantId, id);
    this.validateFlow(dto.flow);

    const ivr = await this.prisma.iVR.update({
      where: { id },
      data: {
        draftFlowJson: dto.flow as unknown as Prisma.InputJsonValue,
        flowStatus: IvrFlowStatus.DRAFT,
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: ivrInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ivr.draft.save',
      entityType: 'IVR',
      entityId: ivr.id,
    });

    return ivr;
  }

  async publish(tenantId: string, userId: string, id: string, dto: PublishIvrDto) {
    const existing = await this.require(tenantId, id);
    const flow = existing.draftFlowJson as { nodes?: unknown[]; edges?: unknown[] } | null;
    if (!flow?.nodes?.length) {
      throw new BadRequestException('Draft flow is empty — add nodes before publishing');
    }
    this.validateFlow(flow);

    const nextVersion = existing.publishedVersion + 1;

    const ivr = await this.prisma.$transaction(async (tx) => {
      await tx.ivrFlowVersion.create({
        data: {
          id: randomUUID(),
          tenantId,
          ivrId: id,
          version: nextVersion,
          flowJson: flow as Prisma.InputJsonValue,
          changeNotes: dto.changeNotes,
          publishedBy: userId,
        },
      });

      return tx.iVR.update({
        where: { id },
        data: {
          publishedFlowJson: flow as Prisma.InputJsonValue,
          publishedVersion: nextVersion,
          publishedAt: new Date(),
          flowStatus: IvrFlowStatus.PUBLISHED,
          updatedBy: userId,
          version: { increment: 1 },
        },
        include: ivrInclude,
      });
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ivr.publish',
      entityType: 'IVR',
      entityId: ivr.id,
      metadata: { version: nextVersion },
    });

    return ivr;
  }

  async clone(tenantId: string, userId: string, id: string, dto: CloneIvrDto) {
    const source = await this.getById(tenantId, id);
    const flow = (source.draftFlowJson ?? source.publishedFlowJson ?? DEFAULT_START_FLOW) as Prisma.InputJsonValue;

    const ivr = await this.prisma.iVR.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('ivr'),
        tenantId,
        name: dto.name,
        code: dto.code,
        description: source.description,
        extension: source.extension,
        language: source.language,
        status: IvrStatus.INACTIVE,
        flowStatus: IvrFlowStatus.DRAFT,
        greetingAnnouncementId: source.greetingAnnouncementId,
        timeoutSec: source.timeoutSec,
        invalidRetries: source.invalidRetries,
        draftFlowJson: flow,
        createdBy: userId,
      },
      include: ivrInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ivr.clone',
      entityType: 'IVR',
      entityId: ivr.id,
      metadata: { sourceId: id },
    });

    return ivr;
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.require(tenantId, id);
    const ivr = await this.prisma.iVR.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ivr.delete',
      entityType: 'IVR',
      entityId: ivr.id,
    });

    return ivr;
  }

  async getVersions(tenantId: string, id: string) {
    await this.require(tenantId, id);
    return this.prisma.ivrFlowVersion.findMany({
      where: { tenantId, ivrId: id },
      orderBy: { version: 'desc' },
    });
  }

  async restoreVersion(tenantId: string, userId: string, id: string, version: number) {
    await this.require(tenantId, id);
    const snapshot = await this.prisma.ivrFlowVersion.findFirst({
      where: { tenantId, ivrId: id, version },
    });
    if (!snapshot) throw new NotFoundException('Flow version not found');

    const ivr = await this.prisma.iVR.update({
      where: { id },
      data: {
        draftFlowJson: snapshot.flowJson as Prisma.InputJsonValue,
        flowStatus: IvrFlowStatus.DRAFT,
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: ivrInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.ivr.version.restore',
      entityType: 'IVR',
      entityId: ivr.id,
      metadata: { version },
    });

    return ivr;
  }

  validateFlow(flow: { nodes?: unknown[]; edges?: unknown[] }) {
    const nodes = flow.nodes ?? [];
    const edges = flow.edges ?? [];
    if (!nodes.length) throw new BadRequestException('Flow must contain at least one node');
    const hasStart = nodes.some((n) => (n as { type?: string }).type === 'start');
    if (!hasStart) throw new BadRequestException('Flow must contain a Start node');

    const nodeIds = new Set(nodes.map((n) => String((n as { id?: string }).id)));
    for (const edge of edges) {
      const e = edge as { source?: string; target?: string };
      if (!nodeIds.has(String(e.source)) || !nodeIds.has(String(e.target))) {
        throw new BadRequestException('Flow contains edges referencing missing nodes');
      }
    }

    return { valid: true, nodeCount: nodes.length, edgeCount: edges.length };
  }

  async simulate(tenantId: string, id: string, dto: SimulateIvrDto) {
    const ivr = await this.getById(tenantId, id);
    const flow = (ivr.draftFlowJson ?? ivr.publishedFlowJson) as {
      nodes: { id: string; type: string; data?: Record<string, unknown> }[];
      edges: { source: string; target: string; sourceHandle?: string }[];
      variables?: Record<string, unknown>;
    } | null;

    if (!flow?.nodes?.length) throw new BadRequestException('No flow to simulate');

    const steps: Record<string, unknown>[] = [];
    const variables = { ...(flow.variables ?? {}), ...(dto.variables ?? {}) };
    let currentId = dto.startNodeId ?? flow.nodes.find((n) => n.type === 'start')?.id;
    const digits = [...(dto.digits ?? [])];

    for (let i = 0; i < 50 && currentId; i++) {
      const node = flow.nodes.find((n) => n.id === currentId);
      if (!node) break;

      steps.push({ step: i + 1, nodeId: node.id, type: node.type, data: node.data ?? {} });

      if (node.type === 'disconnect' || node.type === 'error') break;

      if (node.type === 'menu' && digits.length) {
        const digit = digits.shift();
        const edge = flow.edges.find(
          (e) => e.source === node.id && (e.sourceHandle === digit || e.sourceHandle === `digit-${digit}`),
        );
        currentId = edge?.target ?? flow.edges.find((e) => e.source === node.id)?.target;
        steps.push({ step: i + 1, action: 'digit', digit, nextNodeId: currentId });
        continue;
      }

      if (node.type === 'collect_digits' && digits.length) {
        const collected = digits.shift();
        variables['collected'] = collected;
        steps.push({ step: i + 1, action: 'collected', digits: collected });
      }

      const nextEdge = flow.edges.find((e) => e.source === node.id);
      currentId = nextEdge?.target;
    }

    return { ivrId: id, steps, variables, completed: !currentId || steps.at(-1)?.type === 'disconnect' };
  }

  async getReports(tenantId: string, id: string, days = 7) {
    await this.require(tenantId, id);
    const since = new Date(Date.now() - days * 86400000);

    const [events, sessions] = await Promise.all([
      this.prisma.ivrInteractionLog.groupBy({
        by: ['eventType'],
        where: { tenantId, ivrId: id, createdAt: { gte: since } },
        _count: { id: true },
      }),
      this.prisma.callSession.count({
        where: { tenantId, ivrId: id, startedAt: { gte: since }, deletedAt: null },
      }),
    ]);

    const selections = await this.prisma.ivrInteractionLog.count({
      where: { tenantId, ivrId: id, eventType: IvrInteractionEventType.MENU_SELECTION, createdAt: { gte: since } },
    });

    return {
      ivrId: id,
      periodDays: days,
      totalSessions: sessions,
      events: events.map((e) => ({ type: e.eventType, count: e._count.id })),
      menuSelections: selections,
      dropOffs: events.find((e) => e.eventType === IvrInteractionEventType.DISCONNECT)?._count.id ?? 0,
      timeouts: events.find((e) => e.eventType === IvrInteractionEventType.TIMEOUT)?._count.id ?? 0,
      failures: events.find((e) => e.eventType === IvrInteractionEventType.FAILURE)?._count.id ?? 0,
      transfers: events.find((e) => e.eventType === IvrInteractionEventType.TRANSFER)?._count.id ?? 0,
    };
  }

  async bulkImport(tenantId: string, userId: string, dto: BulkImportIvrsDto) {
    const results: { name: string; ok: boolean; error?: string }[] = [];

    for (const row of dto.rows) {
      const name = String(row.name ?? '');
      const code = String(row.code ?? '');
      if (!name || !code) {
        results.push({ name: name || code || 'unknown', ok: false, error: 'name and code required' });
        continue;
      }
      try {
        await this.create(tenantId, userId, {
          name,
          code,
          description: row.description ? String(row.description) : undefined,
          extension: row.extension ? String(row.extension) : undefined,
          language: row.language ? String(row.language) : undefined,
        });
        results.push({ name, ok: true });
      } catch (e) {
        results.push({ name, ok: false, error: e instanceof Error ? e.message : 'Import failed' });
      }
    }

    return { results };
  }

  async exportJson(tenantId: string) {
    const rows = await this.list(tenantId);
    return rows.map((r) => ({
      name: r.name,
      code: r.code,
      description: r.description,
      extension: r.extension,
      language: r.language,
      status: r.status,
      flowStatus: r.flowStatus,
      draftFlow: r.draftFlowJson,
      publishedFlow: r.publishedFlowJson,
    }));
  }

  private async require(tenantId: string, id: string) {
    const row = await this.prisma.iVR.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('IVR not found');
    return row;
  }
}
