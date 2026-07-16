import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  BulkImportInboundRoutesDto,
  BulkImportOutboundRoutesDto,
  CreateInboundRouteDto,
  CreateOutboundRouteDto,
  TestRouteDto,
  UpdateInboundRouteDto,
  UpdateOutboundRouteDto,
} from '../dto/tenant-call-routes.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { assertPhoneNumberBelongsToTenant, tenantScope } from '../utils/tenant.util';
import { TenantTimeConditionsService } from './tenant-time-conditions.service';
import { TenantHolidayCalendarsService } from './tenant-holiday-calendars.service';

const inboundInclude = {
  phoneNumber: { select: { id: true, number: true } },
  timeCondition: { select: { id: true, name: true } },
  holidayCalendar: { select: { id: true, name: true } },
} satisfies Prisma.InboundRouteInclude;

const outboundInclude = {
  line: { select: { id: true, name: true } },
  carrier: { select: { id: true, name: true } },
} satisfies Prisma.OutboundRouteInclude;

@Injectable()
export class TenantCallRoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
    private readonly timeConditions: TenantTimeConditionsService,
    private readonly holidays: TenantHolidayCalendarsService,
  ) {}

  // Inbound routes
  async listInbound(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.inboundRoute.findMany({
      where: tenantScope(tenantId),
      include: inboundInclude,
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      take: 500,
    });
  }

  async getInboundById(tenantId: string, id: string) {
    const row = await this.prisma.inboundRoute.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: inboundInclude,
    });
    if (!row) throw new NotFoundException('Inbound route not found');
    return row;
  }

  async createInbound(tenantId: string, userId: string, dto: CreateInboundRouteDto) {
    await assertPhoneNumberBelongsToTenant(this.prisma, dto.phoneNumberId, tenantId);
    const route = await this.prisma.inboundRoute.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: dto.name,
        description: dto.description,
        phoneNumberId: dto.phoneNumberId,
        priority: dto.priority ?? 100,
        destinationType: dto.destinationType,
        destinationLineId: dto.destinationLineId,
        destinationQueueId: dto.destinationQueueId,
        destinationIvrId: dto.destinationIvrId,
        destinationRingGroupId: dto.destinationRingGroupId,
        timeConditionId: dto.timeConditionId,
        holidayCalendarId: dto.holidayCalendarId,
        openHoursDestinationType: dto.openHoursDestinationType,
        openHoursDestinationId: dto.openHoursDestinationId,
        afterHoursDestinationType: dto.afterHoursDestinationType,
        afterHoursDestinationId: dto.afterHoursDestinationId,
        failoverDestinationType: dto.failoverDestinationType,
        failoverDestinationId: dto.failoverDestinationId,
        externalDestination: dto.externalDestination,
        enabled: dto.enabled ?? true,
        createdBy: userId,
      },
      include: inboundInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.inbound_route.create',
      entityType: 'InboundRoute',
      entityId: route.id,
      metadata: { name: dto.name },
    });

    return route;
  }

  async updateInbound(tenantId: string, userId: string, id: string, dto: UpdateInboundRouteDto) {
    await this.requireInbound(tenantId, id);
    if (dto.phoneNumberId !== undefined) {
      await assertPhoneNumberBelongsToTenant(this.prisma, dto.phoneNumberId, tenantId);
    }

    const route = await this.prisma.inboundRoute.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.phoneNumberId !== undefined ? { phoneNumberId: dto.phoneNumberId } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.destinationType !== undefined ? { destinationType: dto.destinationType } : {}),
        ...(dto.destinationLineId !== undefined ? { destinationLineId: dto.destinationLineId } : {}),
        ...(dto.destinationQueueId !== undefined ? { destinationQueueId: dto.destinationQueueId } : {}),
        ...(dto.destinationIvrId !== undefined ? { destinationIvrId: dto.destinationIvrId } : {}),
        ...(dto.destinationRingGroupId !== undefined ? { destinationRingGroupId: dto.destinationRingGroupId } : {}),
        ...(dto.timeConditionId !== undefined ? { timeConditionId: dto.timeConditionId } : {}),
        ...(dto.holidayCalendarId !== undefined ? { holidayCalendarId: dto.holidayCalendarId } : {}),
        ...(dto.openHoursDestinationType !== undefined ? { openHoursDestinationType: dto.openHoursDestinationType } : {}),
        ...(dto.openHoursDestinationId !== undefined ? { openHoursDestinationId: dto.openHoursDestinationId } : {}),
        ...(dto.afterHoursDestinationType !== undefined ? { afterHoursDestinationType: dto.afterHoursDestinationType } : {}),
        ...(dto.afterHoursDestinationId !== undefined ? { afterHoursDestinationId: dto.afterHoursDestinationId } : {}),
        ...(dto.failoverDestinationType !== undefined ? { failoverDestinationType: dto.failoverDestinationType } : {}),
        ...(dto.failoverDestinationId !== undefined ? { failoverDestinationId: dto.failoverDestinationId } : {}),
        ...(dto.externalDestination !== undefined ? { externalDestination: dto.externalDestination } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: inboundInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.inbound_route.update',
      entityType: 'InboundRoute',
      entityId: route.id,
    });

    return route;
  }

  async removeInbound(tenantId: string, userId: string, id: string) {
    await this.requireInbound(tenantId, id);
    const route = await this.prisma.inboundRoute.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.inbound_route.delete',
      entityType: 'InboundRoute',
      entityId: route.id,
    });

    return route;
  }

  async cloneInbound(tenantId: string, userId: string, id: string, name: string) {
    const source = await this.getInboundById(tenantId, id);
    return this.createInbound(tenantId, userId, {
      name,
      description: source.description ?? undefined,
      phoneNumberId: source.phoneNumberId ?? undefined,
      priority: source.priority + 1,
      destinationType: source.destinationType,
      destinationLineId: source.destinationLineId ?? undefined,
      destinationQueueId: source.destinationQueueId ?? undefined,
      destinationIvrId: source.destinationIvrId ?? undefined,
      destinationRingGroupId: source.destinationRingGroupId ?? undefined,
      timeConditionId: source.timeConditionId ?? undefined,
      holidayCalendarId: source.holidayCalendarId ?? undefined,
      openHoursDestinationType: source.openHoursDestinationType ?? undefined,
      openHoursDestinationId: source.openHoursDestinationId ?? undefined,
      afterHoursDestinationType: source.afterHoursDestinationType ?? undefined,
      afterHoursDestinationId: source.afterHoursDestinationId ?? undefined,
      failoverDestinationType: source.failoverDestinationType ?? undefined,
      failoverDestinationId: source.failoverDestinationId ?? undefined,
      externalDestination: source.externalDestination ?? undefined,
      enabled: false,
    });
  }

  async bulkImportInbound(tenantId: string, userId: string, dto: BulkImportInboundRoutesDto) {
    const results: { name: string; ok: boolean; error?: string }[] = [];
    for (const row of dto.rows) {
      const name = String(row.name ?? '');
      if (!name || !row.destinationType) {
        results.push({ name: name || 'unknown', ok: false, error: 'name and destinationType required' });
        continue;
      }
      try {
        await this.createInbound(tenantId, userId, {
          name,
          description: row.description ? String(row.description) : undefined,
          phoneNumberId: row.phoneNumberId ? String(row.phoneNumberId) : undefined,
          priority: row.priority != null ? Number(row.priority) : undefined,
          destinationType: row.destinationType as CreateInboundRouteDto['destinationType'],
          externalDestination: row.externalDestination ? String(row.externalDestination) : undefined,
        });
        results.push({ name, ok: true });
      } catch (e) {
        results.push({ name, ok: false, error: e instanceof Error ? e.message : 'Import failed' });
      }
    }
    return { results };
  }

  async exportInboundJson(tenantId: string) {
    return this.listInbound(tenantId);
  }

  // Outbound routes
  async listOutbound(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.outboundRoute.findMany({
      where: tenantScope(tenantId),
      include: outboundInclude,
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      take: 500,
    });
  }

  async getOutboundById(tenantId: string, id: string) {
    const row = await this.prisma.outboundRoute.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: outboundInclude,
    });
    if (!row) throw new NotFoundException('Outbound route not found');
    return row;
  }

  async createOutbound(tenantId: string, userId: string, dto: CreateOutboundRouteDto) {
    const route = await this.prisma.outboundRoute.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: dto.name,
        description: dto.description,
        lineId: dto.lineId,
        pattern: dto.pattern,
        prefix: dto.prefix,
        suffix: dto.suffix,
        stripDigits: dto.stripDigits ?? 0,
        callerIdPolicy: dto.callerIdPolicy,
        carrierId: dto.carrierId,
        failoverCarrierId: dto.failoverCarrierId,
        priority: dto.priority ?? 100,
        emergencyRoute: dto.emergencyRoute ?? false,
        internationalAllowed: dto.internationalAllowed ?? true,
        normalizeE164: dto.normalizeE164 ?? true,
        enabled: dto.enabled ?? true,
        createdBy: userId,
      },
      include: outboundInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.outbound_route.create',
      entityType: 'OutboundRoute',
      entityId: route.id,
      metadata: { name: dto.name, pattern: dto.pattern },
    });

    return route;
  }

  async updateOutbound(tenantId: string, userId: string, id: string, dto: UpdateOutboundRouteDto) {
    await this.requireOutbound(tenantId, id);

    const route = await this.prisma.outboundRoute.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.lineId !== undefined ? { lineId: dto.lineId } : {}),
        ...(dto.pattern !== undefined ? { pattern: dto.pattern } : {}),
        ...(dto.prefix !== undefined ? { prefix: dto.prefix } : {}),
        ...(dto.suffix !== undefined ? { suffix: dto.suffix } : {}),
        ...(dto.stripDigits !== undefined ? { stripDigits: dto.stripDigits } : {}),
        ...(dto.callerIdPolicy !== undefined ? { callerIdPolicy: dto.callerIdPolicy } : {}),
        ...(dto.carrierId !== undefined ? { carrierId: dto.carrierId } : {}),
        ...(dto.failoverCarrierId !== undefined ? { failoverCarrierId: dto.failoverCarrierId } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.emergencyRoute !== undefined ? { emergencyRoute: dto.emergencyRoute } : {}),
        ...(dto.internationalAllowed !== undefined ? { internationalAllowed: dto.internationalAllowed } : {}),
        ...(dto.normalizeE164 !== undefined ? { normalizeE164: dto.normalizeE164 } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: outboundInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.outbound_route.update',
      entityType: 'OutboundRoute',
      entityId: route.id,
    });

    return route;
  }

  async removeOutbound(tenantId: string, userId: string, id: string) {
    await this.requireOutbound(tenantId, id);
    const route = await this.prisma.outboundRoute.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.outbound_route.delete',
      entityType: 'OutboundRoute',
      entityId: route.id,
    });

    return route;
  }

  async bulkImportOutbound(tenantId: string, userId: string, dto: BulkImportOutboundRoutesDto) {
    const results: { name: string; ok: boolean; error?: string }[] = [];
    for (const row of dto.rows) {
      const name = String(row.name ?? '');
      const pattern = String(row.pattern ?? '');
      if (!name || !pattern) {
        results.push({ name: name || 'unknown', ok: false, error: 'name and pattern required' });
        continue;
      }
      try {
        await this.createOutbound(tenantId, userId, {
          name,
          pattern,
          description: row.description ? String(row.description) : undefined,
          prefix: row.prefix ? String(row.prefix) : undefined,
          suffix: row.suffix ? String(row.suffix) : undefined,
          emergencyRoute: row.emergencyRoute === true,
        });
        results.push({ name, ok: true });
      } catch (e) {
        results.push({ name, ok: false, error: e instanceof Error ? e.message : 'Import failed' });
      }
    }
    return { results };
  }

  async exportOutboundJson(tenantId: string) {
    return this.listOutbound(tenantId);
  }

  async testRoute(tenantId: string, dto: TestRouteDto) {
    const routes = await this.listInbound(tenantId);
    const enabled = routes.filter((r) => r.enabled);

    let matched = dto.inboundRouteId
      ? enabled.find((r) => r.id === dto.inboundRouteId)
      : undefined;

    if (!matched && dto.phoneNumber) {
      const normalized = dto.phoneNumber.replace(/\D/g, '');
      matched = enabled.find((r) => {
        const num = r.phoneNumber?.number?.replace(/\D/g, '');
        return num && (num === normalized || normalized.endsWith(num));
      });
    }

    if (!matched) {
      matched = enabled.sort((a, b) => a.priority - b.priority)[0];
    }

    if (!matched) {
      return { matched: false, path: [], message: 'No inbound routes configured' };
    }

    const path: Record<string, unknown>[] = [{ step: 'inbound_route', routeId: matched.id, name: matched.name }];

    if (matched.holidayCalendarId) {
      const isHoliday = await this.holidays.isHoliday(tenantId, matched.holidayCalendarId);
      path.push({ step: 'holiday_check', isHoliday });
      if (isHoliday && matched.afterHoursDestinationType) {
        path.push({
          step: 'destination',
          type: matched.afterHoursDestinationType,
          id: matched.afterHoursDestinationId,
          reason: 'holiday',
        });
        return { matched: true, route: matched, path };
      }
    }

    if (matched.timeConditionId) {
      const evalResult = await this.timeConditions.evaluate(tenantId, matched.timeConditionId);
      path.push({ step: 'time_condition', ...evalResult });
      if (evalResult.matches && matched.openHoursDestinationType) {
        path.push({
          step: 'destination',
          type: matched.openHoursDestinationType,
          id: matched.openHoursDestinationId,
          reason: 'open_hours',
        });
        return { matched: true, route: matched, path };
      }
      if (!evalResult.matches && matched.afterHoursDestinationType) {
        path.push({
          step: 'destination',
          type: matched.afterHoursDestinationType,
          id: matched.afterHoursDestinationId,
          reason: 'after_hours',
        });
        return { matched: true, route: matched, path };
      }
    }

    path.push({
      step: 'destination',
      type: matched.destinationType,
      lineId: matched.destinationLineId,
      extensionId: matched.destinationExtensionId,
      queueId: matched.destinationQueueId,
      ivrId: matched.destinationIvrId,
      ringGroupId: matched.destinationRingGroupId,
      voicemailId: matched.destinationVoicemailId,
      conferenceId: matched.destinationConferenceId,
      external: matched.externalDestination,
    });

    if (matched.failoverDestinationType) {
      path.push({
        step: 'failover',
        type: matched.failoverDestinationType,
        id: matched.failoverDestinationId,
      });
    }

    return { matched: true, route: matched, path };
  }

  async getLiveMetrics(tenantId: string) {
    const [inboundCount, outboundCount, activeIvrs] = await Promise.all([
      this.prisma.inboundRoute.count({ where: { ...tenantScope(tenantId), enabled: true } }),
      this.prisma.outboundRoute.count({ where: { ...tenantScope(tenantId), enabled: true } }),
      this.prisma.iVR.count({ where: { ...tenantScope(tenantId), status: 'ACTIVE', deletedAt: null } }),
    ]);

    const since = new Date(Date.now() - 86400000);
    const ivrSessions = await this.prisma.callSession.count({
      where: { tenantId, ivrId: { not: null }, startedAt: { gte: since } },
    });

    return {
      inboundRoutes: inboundCount,
      outboundRoutes: outboundCount,
      activeIvrs,
      ivrSessionsToday: ivrSessions,
    };
  }

  private async requireInbound(tenantId: string, id: string) {
    const row = await this.prisma.inboundRoute.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Inbound route not found');
    return row;
  }

  private async requireOutbound(tenantId: string, id: string) {
    const row = await this.prisma.outboundRoute.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Outbound route not found');
    return row;
  }
}
