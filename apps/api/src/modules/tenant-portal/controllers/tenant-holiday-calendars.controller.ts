import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import {
  CheckHolidayDto,
  CreateHolidayCalendarDto,
  UpdateHolidayCalendarDto,
} from '../dto/tenant-holiday-calendars.dto';
import { TenantHolidayCalendarsService } from '../services/tenant-holiday-calendars.service';

@ApiTags('tenant-holiday-calendars')
@ApiBearerAuth()
@Controller('v1/tenant/holiday-calendars')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantHolidayCalendarsController {
  constructor(private readonly holidays: TenantHolidayCalendarsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  async list(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.holidays.list(user.tenantId);
    return { data };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  getById(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.holidays.getById(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  create(@Body() dto: CreateHolidayCalendarDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.holidays.create(user.tenantId, user.sub, dto);
  }

  @Post(':id/check')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  check(@Param('id') id: string, @Body() dto: CheckHolidayDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.holidays.isHoliday(user.tenantId, id, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateHolidayCalendarDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.holidays.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_ROUTING_WRITE, PERMISSIONS.TENANT_ADMIN)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.holidays.remove(user.tenantId, user.sub, id);
  }
}
