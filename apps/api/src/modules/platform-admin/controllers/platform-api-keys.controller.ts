import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import {
  PlatformApiKeysService,
  type CreateApiKeyDto,
} from '../services/platform-api-keys.service';

@ApiTags('platform-api-keys')
@ApiBearerAuth()
@Controller('v1/platform/api-keys')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformApiKeysController {
  constructor(private readonly apiKeys: PlatformApiKeysService) {}

  @Get()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_API_KEYS_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'List platform API keys' })
  async list(@Query('tenantId') tenantId?: string) {
    const data = await this.apiKeys.list(tenantId);
    return { data };
  }

  @Post()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_API_KEYS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Create platform API key' })
  async create(@Body() dto: CreateApiKeyDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.apiKeys.create(dto, user.sub);
    return { data };
  }

  @Delete(':id')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_API_KEYS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Revoke platform API key' })
  async revoke(@Param('id') id: string) {
    const data = await this.apiKeys.revoke(id);
    return { data };
  }
}
