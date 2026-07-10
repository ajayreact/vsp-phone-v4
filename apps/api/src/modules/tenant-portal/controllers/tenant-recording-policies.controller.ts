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
import { CreateRecordingPolicyDto, UpdateRecordingPolicyDto } from '../dto/tenant-recording-policies.dto';
import { TenantRecordingPoliciesService } from '../services/tenant-recording-policies.service';

@ApiTags('tenant-recording-policies')
@ApiBearerAuth()
@Controller('v1/tenant/recording-policies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantRecordingPoliciesController {
  constructor(private readonly policies: TenantRecordingPoliciesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_RECORDING_POLICIES_READ)
  async list(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.policies.list(user.tenantId);
    return { data };
  }

  @Get('lines/:lineId')
  @RequirePermission(PERMISSIONS.TENANT_RECORDING_POLICIES_READ)
  getByLine(@Param('lineId') lineId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.policies.getByLineId(user.tenantId, lineId);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_RECORDING_POLICIES_READ)
  getById(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.policies.getById(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_RECORDING_POLICIES_WRITE)
  create(@Body() dto: CreateRecordingPolicyDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.policies.create(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_RECORDING_POLICIES_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateRecordingPolicyDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.policies.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_RECORDING_POLICIES_WRITE, PERMISSIONS.TENANT_ADMIN)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.policies.remove(user.tenantId, user.sub, id);
  }
}
