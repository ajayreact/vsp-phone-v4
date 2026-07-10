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
  CloneConferenceDto,
  ConferenceParticipantActionDto,
  CreateConferenceDto,
  UpdateConferenceDto,
} from '../dto/tenant-conferences.dto';
import { TenantConferencesService } from '../services/tenant-conferences.service';

@ApiTags('tenant-conferences')
@ApiBearerAuth()
@Controller('v1/tenant/conferences')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantConferencesController {
  constructor(private readonly conferences: TenantConferencesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_CONFERENCES_READ)
  async list(@Req() req: Request, @Query('search') search?: string) {
    const user = getJwtUser(req);
    const data = await this.conferences.list(user.tenantId, search);
    return { data };
  }

  @Get('reports')
  @RequirePermission(PERMISSIONS.TENANT_CONFERENCES_READ)
  reports(@Req() req: Request, @Query('days') days?: string) {
    const user = getJwtUser(req);
    return this.conferences.getReports(user.tenantId, days ? Number(days) : 30);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_CONFERENCES_READ)
  getById(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.conferences.getById(user.tenantId, id);
  }

  @Get(':id/live')
  @RequirePermission(PERMISSIONS.TENANT_CONFERENCES_READ)
  live(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.conferences.getLive(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_CONFERENCES_WRITE)
  create(@Body() dto: CreateConferenceDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.conferences.create(user.tenantId, user.sub, dto);
  }

  @Post(':id/clone')
  @RequirePermission(PERMISSIONS.TENANT_CONFERENCES_WRITE)
  clone(@Param('id') id: string, @Body() dto: CloneConferenceDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.conferences.clone(user.tenantId, user.sub, id, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_CONFERENCES_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateConferenceDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.conferences.update(user.tenantId, user.sub, id, dto);
  }

  @Patch(':id/participants/:participantId')
  @RequirePermission(PERMISSIONS.TENANT_CONFERENCES_WRITE)
  updateParticipant(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body() dto: ConferenceParticipantActionDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.conferences.updateParticipant(user.tenantId, user.sub, id, participantId, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_CONFERENCES_WRITE, PERMISSIONS.TENANT_ADMIN)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.conferences.remove(user.tenantId, user.sub, id);
  }

  @Delete(':id/participants/:participantId')
  @RequirePermission(PERMISSIONS.TENANT_CONFERENCES_WRITE)
  removeParticipant(@Param('id') id: string, @Param('participantId') participantId: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.conferences.removeParticipant(user.tenantId, user.sub, id, participantId);
  }
}
