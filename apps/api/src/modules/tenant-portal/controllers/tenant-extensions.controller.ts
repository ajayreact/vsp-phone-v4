import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import {
  TenantExtensionsService,
  type CreateExtensionDto,
  type UpdateExtensionDto,
} from '../services/tenant-extensions.service';

@ApiTags('tenant-extensions')
@ApiBearerAuth()
@Controller('v1/tenant/extensions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantExtensionsController {
  constructor(private readonly extensions: TenantExtensionsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_READ)
  @ApiOperation({ summary: 'List tenant extensions' })
  async list(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.extensions.list(user.tenantId, search);
    return { data };
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_WRITE)
  @ApiOperation({ summary: 'Create extension' })
  create(@Body() dto: CreateExtensionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.create(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_WRITE)
  @ApiOperation({ summary: 'Update extension' })
  update(@Param('id') id: string, @Body() dto: UpdateExtensionDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_EXTENSIONS_WRITE, PERMISSIONS.TENANT_ADMIN)
  @ApiOperation({ summary: 'Soft-delete extension' })
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.extensions.remove(user.tenantId, user.sub, id);
  }
}
