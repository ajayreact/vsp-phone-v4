import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { PlatformSystemHealthService } from '../services/platform-system-health.service';

@ApiTags('platform-system-health')
@ApiBearerAuth()
@Controller('v1/platform/system-health')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformSystemHealthController {
  constructor(private readonly systemHealth: PlatformSystemHealthService) {}

  @Get()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_DASHBOARD_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({
    summary: 'Platform system health (infra probes + deployment readiness)',
    description:
      'Platform Admin surface for System Health. Does not use /v1/ops — portal JWT must be platform.',
  })
  async detail() {
    return this.systemHealth.getDetail();
  }
}
