import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { PlatformProvisioningSettingsService } from '../services/platform-provisioning-settings.service';

@ApiTags('platform-provisioning')
@ApiBearerAuth()
@Controller('v1/platform/provisioning')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformProvisioningSettingsController {
  constructor(private readonly settings: PlatformProvisioningSettingsService) {}

  @Get('settings')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_SETTINGS_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Platform provisioning edge settings (base URL, vendors, status, templates)' })
  async getSettings() {
    const data = await this.settings.getSettings();
    return { data };
  }
}
