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
  BulkRecordingIdsDto,
  RecordingAnnotationDto,
  SearchRecordingsDto,
  UpdateRecordingDto,
} from '../dto/tenant-recordings.dto';
import { TenantRecordingsService } from '../services/tenant-recordings.service';

@ApiTags('tenant-recordings')
@ApiBearerAuth()
@Controller('v1/tenant/recordings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantRecordingsController {
  constructor(private readonly recordings: TenantRecordingsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.RECORDINGS_READ)
  async search(@Query() query: SearchRecordingsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.recordings.search(user.tenantId, query);
    return { data };
  }

  @Get('reports')
  @RequirePermission(PERMISSIONS.RECORDINGS_READ)
  reports(@Req() req: Request, @Query('days') days?: string) {
    const user = getJwtUser(req);
    return this.recordings.getReports(user.tenantId, days ? Number(days) : 30);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.RECORDINGS_READ)
  getById(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.recordings.getById(user.tenantId, id);
  }

  @Get(':id/playback')
  @RequirePermission(PERMISSIONS.RECORDINGS_READ)
  playback(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.recordings.getPlaybackUrl(user.tenantId, id);
  }

  @Get(':id/transcript')
  @RequirePermission(PERMISSIONS.RECORDINGS_READ)
  transcript(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.recordings.getTranscript(user.tenantId, id);
  }

  @Patch(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_RECORDINGS_WRITE, PERMISSIONS.TENANT_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateRecordingDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.recordings.update(user.tenantId, user.sub, id, dto);
  }

  @Post(':id/annotations')
  @RequireAnyPermission(PERMISSIONS.TENANT_RECORDINGS_WRITE, PERMISSIONS.TENANT_ADMIN)
  annotate(@Param('id') id: string, @Body() dto: RecordingAnnotationDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.recordings.addAnnotation(user.tenantId, user.sub, id, dto);
  }

  @Post('bulk-delete')
  @RequireAnyPermission(PERMISSIONS.TENANT_RECORDINGS_WRITE, PERMISSIONS.TENANT_ADMIN)
  bulkDelete(@Body() dto: BulkRecordingIdsDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.recordings.bulkDelete(user.tenantId, user.sub, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_RECORDINGS_WRITE, PERMISSIONS.TENANT_ADMIN)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.recordings.remove(user.tenantId, user.sub, id);
  }
}
