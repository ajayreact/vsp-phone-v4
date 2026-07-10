import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
  TenantVoicemailService,
  type CreateVoicemailDto,
  type UpdateVoicemailDto,
} from '../services/tenant-voicemail.service';

@ApiTags('tenant-voicemail')
@ApiBearerAuth()
@Controller('v1/tenant/voicemail')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantVoicemailController {
  constructor(private readonly voicemail: TenantVoicemailService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_READ)
  @ApiOperation({ summary: 'List voicemail boxes' })
  async list(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.voicemail.list(user.tenantId);
    return { data };
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_WRITE)
  @ApiOperation({ summary: 'Create voicemail box' })
  create(@Body() dto: CreateVoicemailDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.create(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_VOICEMAIL_WRITE)
  @ApiOperation({ summary: 'Update voicemail box' })
  update(@Param('id') id: string, @Body() dto: UpdateVoicemailDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_VOICEMAIL_WRITE, PERMISSIONS.TENANT_ADMIN)
  @ApiOperation({ summary: 'Soft-delete voicemail box' })
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.voicemail.remove(user.tenantId, user.sub, id);
  }
}
