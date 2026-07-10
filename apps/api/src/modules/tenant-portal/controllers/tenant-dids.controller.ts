import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';
import { TenantDidsService } from '../services/tenant-dids.service';

@ApiTags('tenant-dids')
@ApiBearerAuth()
@Controller('v1/tenant/dids')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantDidsController {
  constructor(private readonly dids: TenantDidsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  @ApiOperation({ summary: 'List tenant phone numbers (DIDs)' })
  async list(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.dids.list(user.tenantId, search);
    return { data };
  }
}
