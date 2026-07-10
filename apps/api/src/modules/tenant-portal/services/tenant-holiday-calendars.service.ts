import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type { CheckHolidayDto, CreateHolidayCalendarDto, UpdateHolidayCalendarDto } from '../dto/tenant-holiday-calendars.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { tenantScope } from '../utils/tenant.util';

const include = {
  holidays: { orderBy: { date: 'asc' } },
} satisfies Prisma.HolidayCalendarInclude;

@Injectable()
export class TenantHolidayCalendarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  async list(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.holidayCalendar.findMany({
      where: tenantScope(tenantId),
      include,
      orderBy: { name: 'asc' },
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.holidayCalendar.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include,
    });
    if (!row) throw new NotFoundException('Holiday calendar not found');
    return row;
  }

  async create(tenantId: string, userId: string, dto: CreateHolidayCalendarDto) {
    const cal = await this.prisma.holidayCalendar.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: dto.name,
        description: dto.description,
        region: dto.region,
        createdBy: userId,
        holidays: dto.holidays?.length
          ? {
              create: dto.holidays.map((h) => ({
                id: randomUUID(),
                name: h.name,
                date: new Date(h.date),
                recurring: h.recurring ?? false,
                region: h.region,
                isOverride: h.isOverride ?? false,
              })),
            }
          : undefined,
      },
      include,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.holiday_calendar.create',
      entityType: 'HolidayCalendar',
      entityId: cal.id,
      metadata: { name: dto.name },
    });

    return cal;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateHolidayCalendarDto) {
    await this.require(tenantId, id);

    if (dto.holidays) {
      await this.prisma.holiday.deleteMany({ where: { holidayCalendarId: id } });
    }

    const cal = await this.prisma.holidayCalendar.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.region !== undefined ? { region: dto.region } : {}),
        updatedBy: userId,
        version: { increment: 1 },
        ...(dto.holidays?.length
          ? {
              holidays: {
                create: dto.holidays.map((h) => ({
                  id: randomUUID(),
                  name: h.name,
                  date: new Date(h.date),
                  recurring: h.recurring ?? false,
                  region: h.region,
                  isOverride: h.isOverride ?? false,
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
      action: 'pbx.holiday_calendar.update',
      entityType: 'HolidayCalendar',
      entityId: cal.id,
    });

    return cal;
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.require(tenantId, id);
    const cal = await this.prisma.holidayCalendar.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.holiday_calendar.delete',
      entityType: 'HolidayCalendar',
      entityId: cal.id,
    });

    return cal;
  }

  async isHoliday(tenantId: string, calendarId: string, dto?: CheckHolidayDto) {
    const cal = await this.getById(tenantId, calendarId);
    const checkDate = dto?.date ? new Date(dto.date) : new Date();
    const month = checkDate.getUTCMonth() + 1;
    const day = checkDate.getUTCDate();

    const match = cal.holidays.find((h) => {
      const d = new Date(h.date);
      if (h.recurring) {
        return d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
      }
      return d.toISOString().slice(0, 10) === checkDate.toISOString().slice(0, 10);
    });

    return {
      calendarId,
      date: checkDate.toISOString().slice(0, 10),
      isHoliday: Boolean(match),
      holiday: match ?? null,
    };
  }

  private async require(tenantId: string, id: string) {
    const row = await this.prisma.holidayCalendar.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Holiday calendar not found');
    return row;
  }
}
