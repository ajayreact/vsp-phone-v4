import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';
import {
  PlatformApiKeysService,
  type CreateApiKeyDto,
} from '../../platform-admin/services/platform-api-keys.service';

@ApiTags('tenant-api-keys')
@ApiBearerAuth()
@Controller('v1/tenant/api-keys')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantApiKeysController {
  constructor(private readonly apiKeys: PlatformApiKeysService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_SETTINGS_READ)
  @ApiOperation({ summary: 'List tenant API keys' })
  async list(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.apiKeys.list(user.tenantId);
    return { data };
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_SETTINGS_WRITE)
  @ApiOperation({ summary: 'Create tenant API key' })
  async create(@Body() dto: CreateApiKeyDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.apiKeys.create(
      { ...dto, tenantId: user.tenantId, scopes: dto.scopes ?? ['tenant:read'] },
      user.sub,
    );
    return { data };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.TENANT_SETTINGS_WRITE)
  @ApiOperation({ summary: 'Revoke tenant API key' })
  async revoke(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const row = await this.apiKeys.list(user.tenantId);
    if (!row.some((k) => k.id === id)) {
      throw new NotFoundException('API key not found');
    }
    const data = await this.apiKeys.revoke(id);
    return { data };
  }
}
