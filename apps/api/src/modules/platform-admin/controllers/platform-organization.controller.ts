import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import {
  PlatformOrganizationService,
  type UpdateOrganizationDto,
} from '../services/platform-organization.service';

@ApiTags('platform-organization')
@ApiBearerAuth()
@Controller('v1/platform/organization')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformOrganizationController {
  constructor(private readonly organization: PlatformOrganizationService) {}

  @Get(':tenantId')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Get tenant organization profile' })
  async get(@Param('tenantId') tenantId: string) {
    const data = await this.organization.get(tenantId);
    return { data };
  }

  @Patch(':tenantId')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Update tenant organization profile' })
  async update(@Param('tenantId') tenantId: string, @Body() dto: UpdateOrganizationDto) {
    const data = await this.organization.update(tenantId, dto);
    return { data };
  }
}
