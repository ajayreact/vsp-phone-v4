import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { PlatformDashboardService } from '../services/platform-dashboard.service';

@ApiTags('platform-dashboard')
@ApiBearerAuth()
@Controller('v1/platform/dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformDashboardController {
  constructor(private readonly dashboard: PlatformDashboardService) {}

  @Get()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_DASHBOARD_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Platform-wide KPI dashboard snapshot' })
  async snapshot() {
    const data = await this.dashboard.snapshot();
    return { data };
  }
}
