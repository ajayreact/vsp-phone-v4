import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';
import { TenantCdrService } from '../services/tenant-cdr.service';

@ApiTags('tenant-cdr')
@ApiBearerAuth()
@Controller('v1/tenant/cdr')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantCdrController {
  constructor(private readonly cdr: TenantCdrService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_CDR_READ)
  @ApiOperation({ summary: 'List call detail records (CallSession)' })
  async list(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.cdr.list(user.tenantId, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
    return { data };
  }
}
