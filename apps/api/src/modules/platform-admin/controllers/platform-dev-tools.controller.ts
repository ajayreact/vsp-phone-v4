import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { TenantDevToolsService } from '../services/tenant-dev-tools.service';

@ApiTags('platform-dev-tools')
@ApiBearerAuth()
@Controller('v1/platform/dev-tools')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformDevToolsController {
  constructor(private readonly tools: TenantDevToolsService) {}

  @Post('tenants/:tenantId/seed-demo')
  @RequirePermission(PERMISSIONS.PLATFORM_DEVTOOLS)
  @ApiOperation({ summary: 'Seed demo extensions/devices (platform.devtools + Developer Mode)' })
  async seedDemo(@Param('tenantId') tenantId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return { data: await this.tools.seedDemoData(tenantId, user.sub) };
  }

  @Post('tenants/:tenantId/generate-extensions')
  @RequirePermission(PERMISSIONS.PLATFORM_DEVTOOLS)
  async generateExtensions(
    @Param('tenantId') tenantId: string,
    @Body() body: { count?: number },
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return { data: await this.tools.generateExtensions(tenantId, user.sub, body?.count) };
  }

  @Post('tenants/:tenantId/generate-devices')
  @RequirePermission(PERMISSIONS.PLATFORM_DEVTOOLS)
  async generateDevices(
    @Param('tenantId') tenantId: string,
    @Body() body: { count?: number },
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return { data: await this.tools.generateDevices(tenantId, user.sub, body?.count) };
  }

  @Post('tenants/:tenantId/generate-users')
  @RequirePermission(PERMISSIONS.PLATFORM_DEVTOOLS)
  async generateUsers(
    @Param('tenantId') tenantId: string,
    @Body() body: { count?: number },
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return { data: await this.tools.generateUsers(tenantId, user.sub, body?.count) };
  }

  @Post('tenants/:tenantId/generate-call-history')
  @RequirePermission(PERMISSIONS.PLATFORM_DEVTOOLS)
  async generateCalls(
    @Param('tenantId') tenantId: string,
    @Body() body: { count?: number },
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return { data: await this.tools.generateCallHistory(tenantId, user.sub, body?.count) };
  }

  @Post('tenants/:tenantId/generate-recordings')
  @RequirePermission(PERMISSIONS.PLATFORM_DEVTOOLS)
  async generateRecordings(
    @Param('tenantId') tenantId: string,
    @Body() body: { count?: number },
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return { data: await this.tools.generateRecordings(tenantId, user.sub, body?.count) };
  }

  @Post('tenants/:tenantId/generate-sip')
  @RequirePermission(PERMISSIONS.PLATFORM_DEVTOOLS)
  async generateSip(@Param('tenantId') tenantId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return { data: await this.tools.generateSipCredentials(tenantId, user.sub) };
  }

  @Post('tenants/:tenantId/clear-demo')
  @RequirePermission(PERMISSIONS.PLATFORM_DEVTOOLS)
  async clearDemo(@Param('tenantId') tenantId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return { data: await this.tools.clearDemoData(tenantId, user.sub) };
  }

  @Post('tenants/:tenantId/reset-demo')
  @RequirePermission(PERMISSIONS.PLATFORM_DEVTOOLS)
  async resetDemo(@Param('tenantId') tenantId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return { data: await this.tools.resetDemoData(tenantId, user.sub) };
  }
}
