import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { PlatformAuditService } from '../services/platform-audit.service';

@ApiTags('platform-audit')
@ApiBearerAuth()
@Controller('v1/platform/audit')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformAuditController {
  constructor(private readonly audit: PlatformAuditService) {}

  @Get()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_AUDIT_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Query platform audit log entries' })
  async query(
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
    @Query('actionPrefix') actionPrefix?: string,
  ) {
    const data = await this.audit.query({
      tenantId,
      limit: limit ? Number(limit) : undefined,
      actionPrefix,
    });
    return { data };
  }
}
