import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { CreateLineDto, UpdateLineDto } from '../dto/tenant-lines.dto';
import { TenantLinesService } from '../services/tenant-lines.service';

@ApiTags('tenant-lines')
@ApiBearerAuth()
@Controller('v1/tenant/lines')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantLinesController {
  constructor(private readonly lines: TenantLinesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_READ)
  @ApiOperation({ summary: 'List tenant lines' })
  async list(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.lines.list(user.tenantId, search);
    return { data };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_READ)
  @ApiOperation({ summary: 'Get line detail' })
  get(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.lines.getById(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Create line with default telephony resources' })
  create(@Body() dto: CreateLineDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.lines.create(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Update line settings' })
  update(@Param('id') id: string, @Body() dto: UpdateLineDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.lines.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE, PERMISSIONS.TENANT_ADMIN)
  @ApiOperation({ summary: 'Soft-delete line' })
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.lines.remove(user.tenantId, user.sub, id);
  }

  @Get(':id/sip-credentials')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_READ)
  @ApiOperation({ summary: 'Get SIP credentials for the line (password never returned in plaintext)' })
  async getSipCredentials(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.lines.getSipCredentials(user.tenantId, id);
    return { data };
  }

  @Post(':id/sip-credentials/reveal')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Reveal current SIP password once' })
  revealSipPassword(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.lines.revealSipPassword(user.tenantId, user.sub, id);
  }

  @Post(':id/sip-credentials/reset')
  @RequirePermission(PERMISSIONS.TENANT_EXTENSIONS_MANAGE)
  @ApiOperation({ summary: 'Rotate SIP password (invalidates current device registration)' })
  resetSipPassword(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.lines.resetSipPassword(user.tenantId, user.sub, id);
  }
}
