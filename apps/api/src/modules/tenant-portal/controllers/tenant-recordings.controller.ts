import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';
import { TenantRecordingsService } from '../services/tenant-recordings.service';

@ApiTags('tenant-recordings')
@ApiBearerAuth()
@Controller('v1/tenant/recordings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantRecordingsController {
  constructor(private readonly recordings: TenantRecordingsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.RECORDINGS_READ)
  @ApiOperation({ summary: 'Browse tenant recordings' })
  async list(
    @Query('callSessionId') callSessionId: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.recordings.list(user.tenantId, {
      callSessionId,
      limit: limit ? Number(limit) : undefined,
    });
    return { data };
  }
}
