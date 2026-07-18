import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';
import {
  ProvisionSessionDeviceDto,
  ProvisionSessionDidDto,
  ProvisionSessionExtensionDto,
  ProvisionSessionUserDto,
  ProvisionSessionVoicemailDto,
} from '../dto/tenant-provision.dto';
import { TenantProvisionService } from '../services/tenant-provision.service';

@ApiTags('tenant-provision')
@ApiBearerAuth()
@Controller('v1/tenant/provision')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantProvisionController {
  constructor(private readonly provision: TenantProvisionService) {}

  @Post('session')
  @RequirePermission(PERMISSIONS.TENANT_USERS_MANAGE)
  @ApiOperation({ summary: 'Start employee provision draft session' })
  createSession(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.provision.createSession(user.tenantId, user.sub).then((data) => ({ data }));
  }

  @Get('session/:sessionId')
  @RequirePermission(PERMISSIONS.TENANT_USERS_MANAGE)
  getSession(@Param('sessionId') sessionId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provision.getSession(user.tenantId, sessionId).then((data) => ({ data }));
  }

  @Patch('session/:sessionId/user')
  @RequirePermission(PERMISSIONS.TENANT_USERS_MANAGE)
  patchUser(@Param('sessionId') sessionId: string, @Body() dto: ProvisionSessionUserDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provision.patchUser(user.tenantId, sessionId, dto).then((data) => ({ data }));
  }

  @Patch('session/:sessionId/extension')
  @RequirePermission(PERMISSIONS.TENANT_USERS_MANAGE)
  patchExtension(
    @Param('sessionId') sessionId: string,
    @Body() dto: ProvisionSessionExtensionDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.provision.patchExtension(user.tenantId, sessionId, dto).then((data) => ({ data }));
  }

  @Patch('session/:sessionId/device')
  @RequirePermission(PERMISSIONS.TENANT_USERS_MANAGE)
  patchDevice(@Param('sessionId') sessionId: string, @Body() dto: ProvisionSessionDeviceDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provision.patchDevice(user.tenantId, sessionId, dto).then((data) => ({ data }));
  }

  @Patch('session/:sessionId/did')
  @RequirePermission(PERMISSIONS.TENANT_USERS_MANAGE)
  patchDid(@Param('sessionId') sessionId: string, @Body() dto: ProvisionSessionDidDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provision.patchDid(user.tenantId, sessionId, dto).then((data) => ({ data }));
  }

  @Patch('session/:sessionId/voicemail')
  @RequirePermission(PERMISSIONS.TENANT_USERS_MANAGE)
  patchVoicemail(
    @Param('sessionId') sessionId: string,
    @Body() dto: ProvisionSessionVoicemailDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.provision.patchVoicemail(user.tenantId, sessionId, dto).then((data) => ({ data }));
  }

  @Post('session/:sessionId/commit')
  @RequirePermission(PERMISSIONS.TENANT_USERS_MANAGE)
  @ApiOperation({ summary: 'Commit provision session in a single transaction' })
  commit(@Param('sessionId') sessionId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.provision.commit(user.tenantId, user.sub, sessionId).then((data) => ({ data }));
  }
}
