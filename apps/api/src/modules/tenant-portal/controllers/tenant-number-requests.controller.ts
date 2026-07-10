import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';
import {
  TenantNumberRequestsService,
  type CreateNumberRequestDto,
} from '../services/tenant-number-requests.service';

@ApiTags('tenant-number-requests')
@ApiBearerAuth()
@Controller('v1/tenant/number-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantNumberRequestsController {
  constructor(private readonly numberRequests: TenantNumberRequestsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  @ApiOperation({ summary: 'List number requests' })
  async list(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.numberRequests.list(user.tenantId);
    return { data };
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_NUMBERS_REQUEST)
  @ApiOperation({ summary: 'Submit a number request' })
  create(@Body() dto: CreateNumberRequestDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.numberRequests.create(user.tenantId, user.sub, dto);
  }
}
