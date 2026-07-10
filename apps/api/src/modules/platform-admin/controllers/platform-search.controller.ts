import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { PlatformSearchService } from '../services/platform-search.service';

@ApiTags('platform-search')
@ApiBearerAuth()
@Controller('v1/platform/search')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformSearchController {
  constructor(private readonly searchService: PlatformSearchService) {}

  @Get()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_DASHBOARD_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Global platform search' })
  async search(@Query('q') q: string, @Query('limit') limit?: string) {
    const data = await this.searchService.search(q ?? '', limit ? Number(limit) : 20);
    return { data };
  }
}
