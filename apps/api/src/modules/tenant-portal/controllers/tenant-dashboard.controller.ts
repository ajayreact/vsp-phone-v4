import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OperationsDashboardService } from '../../enterprise-observability/dashboard/operations-dashboard.service';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';

@ApiTags('tenant-dashboard')
@ApiBearerAuth()
@Controller('v1/tenant/dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantDashboardController {
  constructor(private readonly dashboard: OperationsDashboardService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_DASHBOARD_READ)
  @ApiOperation({ summary: 'Tenant operations dashboard snapshot' })
  snapshot(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.dashboard.snapshot(user.tenantId);
  }
}
