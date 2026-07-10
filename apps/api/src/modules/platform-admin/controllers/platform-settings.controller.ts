import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import {
  PlatformSettingsService,
  type UpdatePlatformSettingsDto,
} from '../services/platform-settings.service';

@ApiTags('platform-settings')
@ApiBearerAuth()
@Controller('v1/platform/settings')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_SETTINGS_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Get platform settings' })
  async get() {
    const data = await this.settings.get();
    return { data };
  }

  @Patch()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_SETTINGS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Update platform settings' })
  async update(@Body() dto: UpdatePlatformSettingsDto) {
    const data = await this.settings.update(dto);
    return { data };
  }
}
