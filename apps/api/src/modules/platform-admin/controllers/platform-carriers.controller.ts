import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { PlatformCarriersService } from '../services/platform-carriers.service';

@ApiTags('platform-carriers')
@ApiBearerAuth()
@Controller('v1/platform/carriers')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformCarriersController {
  constructor(private readonly carriers: PlatformCarriersService) {}

  @Get()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_CARRIERS_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'List carriers with health status' })
  async list() {
    const data = await this.carriers.list();
    return { data };
  }
}
