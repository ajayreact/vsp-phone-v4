import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TimeConditionScheduleType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  CreateTimeConditionDto,
  EvaluateTimeConditionDto,
  UpdateTimeConditionDto,
} from '../dto/tenant-time-conditions.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { tenantScope } from '../utils/tenant.util';

const include = {
  rules: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
} satisfies Prisma.TimeConditionInclude;

@Injectable()
export class TenantTimeConditionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.timeCondition.findMany({
      where: tenantScope(tenantId),
      include,
      orderBy: { name: 'asc' },
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.timeCondition.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include,
    });
    if (!row) throw new NotFoundException('Time condition not found');
    return row;
  }

  async create(tenantId: string, userId: string, dto: CreateTimeConditionDto) {
    const tc = await this.prisma.timeCondition.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: dto.name,
        description: dto.description,
        scheduleType: dto.scheduleType ?? TimeConditionScheduleType.BUSINESS_HOURS,
        timezone: dto.timezone,
        createdBy: userId,
        rules: dto.rules?.length
          ? {
              create: dto.rules.map((r) => ({
                id: randomUUID(),
                dayOfWeek: r.dayOfWeek,
                startTime: r.startTime,
                endTime: r.endTime,
              })),
            }
          : undefined,
      },
      include,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.time_condition.create',
      entityType: 'TimeCondition',
      entityId: tc.id,
      metadata: { name: dto.name },
    });

    return tc;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateTimeConditionDto) {
    await this.require(tenantId, id);

    if (dto.rules) {
      await this.prisma.timeConditionRule.deleteMany({ where: { timeConditionId: id } });
    }

    const tc = await this.prisma.timeCondition.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.scheduleType !== undefined ? { scheduleType: dto.scheduleType } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        updatedBy: userId,
        version: { increment: 1 },
        ...(dto.rules?.length
          ? {
              rules: {
                create: dto.rules.map((r) => ({
                  id: randomUUID(),
                  dayOfWeek: r.dayOfWeek,
                  startTime: r.startTime,
                  endTime: r.endTime,
                })),
              },
            }
          : {}),
      },
      include,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.time_condition.update',
      entityType: 'TimeCondition',
      entityId: tc.id,
    });

    return tc;
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.require(tenantId, id);
    const tc = await this.prisma.timeCondition.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.time_condition.delete',
      entityType: 'TimeCondition',
      entityId: tc.id,
    });

    return tc;
  }

  async evaluate(tenantId: string, id: string, dto?: EvaluateTimeConditionDto) {
    const tc = await this.getById(tenantId, id);
    const at = dto?.at ? new Date(dto.at) : new Date();

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tc.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    const parts = formatter.formatToParts(at);
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[weekday] ?? at.getDay();
    const currentTime = `${hour}:${minute}`;

    const matches = tc.rules.some((rule) => {
      if (rule.dayOfWeek !== dayOfWeek) return false;
      return currentTime >= rule.startTime && currentTime <= rule.endTime;
    });

    return {
      timeConditionId: id,
      scheduleType: tc.scheduleType,
      timezone: tc.timezone,
      evaluatedAt: at.toISOString(),
      dayOfWeek,
      currentTime,
      matches,
    };
  }

  private async require(tenantId: string, id: string) {
    const row = await this.prisma.timeCondition.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Time condition not found');
    return row;
  }
}
