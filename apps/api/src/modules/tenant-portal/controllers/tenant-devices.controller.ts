import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';
import { TenantDevicesService } from '../services/tenant-devices.service';

@ApiTags('tenant-devices')
@ApiBearerAuth()
@Controller('v1/tenant/devices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantDevicesController {
  constructor(private readonly devices: TenantDevicesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_DEVICES_READ)
  @ApiOperation({ summary: 'List tenant devices' })
  async list(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.devices.list(user.tenantId, search);
    return { data };
  }
}
