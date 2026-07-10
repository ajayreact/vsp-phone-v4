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
  CreateTimeConditionDto,
  EvaluateTimeConditionDto,
  UpdateTimeConditionDto,
} from '../dto/tenant-time-conditions.dto';
import { TenantTimeConditionsService } from '../services/tenant-time-conditions.service';

@ApiTags('tenant-time-conditions')
@ApiBearerAuth()
@Controller('v1/tenant/time-conditions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantTimeConditionsController {
  constructor(private readonly timeConditions: TenantTimeConditionsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  async list(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.timeConditions.list(user.tenantId);
    return { data };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  getById(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.timeConditions.getById(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  create(@Body() dto: CreateTimeConditionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.timeConditions.create(user.tenantId, user.sub, dto);
  }

  @Post(':id/evaluate')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  evaluate(@Param('id') id: string, @Body() dto: EvaluateTimeConditionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.timeConditions.evaluate(user.tenantId, id, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateTimeConditionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.timeConditions.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_ROUTING_WRITE, PERMISSIONS.TENANT_ADMIN)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.timeConditions.remove(user.tenantId, user.sub, id);
  }
}
