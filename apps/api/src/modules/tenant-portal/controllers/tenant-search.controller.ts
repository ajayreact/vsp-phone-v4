import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';
import { TenantSearchService } from '../services/tenant-search.service';

@ApiTags('tenant-search')
@ApiBearerAuth()
@Controller('v1/tenant/search')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantSearchController {
  constructor(private readonly search: TenantSearchService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_DASHBOARD_READ)
  @ApiOperation({ summary: 'Global tenant portal search' })
  async query(
    @Query('q') q: string | undefined,
    @Query('lifecycle') lifecycle: string | undefined,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.search.search(user.tenantId, q ?? '', lifecycle);
    return { data };
  }
}
