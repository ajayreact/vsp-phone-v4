import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { RequirePermission, PermissionsGuard } from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import {
  RecordingListItemDto,
  RecordingUrlResponseDto,
} from '../dto/recording.response.dto';
import { RecordingLifecycleService } from '../lifecycle/recording-lifecycle.service';

@ApiTags('recordings')
@ApiBearerAuth()
@Controller('v1/recordings')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class RecordingAdminController {
  constructor(private readonly lifecycle: RecordingLifecycleService) {}

  @Get()
  @RequirePermission(PERMISSIONS.RECORDINGS_READ)
  @ApiOperation({ summary: 'List recordings for CallSession (Phase 12)' })
  async list(
    @Query('callSessionId') callSessionId: string,
    @Req() req: Request,
  ): Promise<RecordingListItemDto[]> {
    const user = getJwtUser(req);
    const rows = await this.lifecycle.listByCallSession(user.tenantId, callSessionId);
    return rows.map((r) => ({
      id: r.id,
      publicId: r.publicId,
      status: r.status,
      mediaObjectKey: r.mediaObjectKey ?? undefined,
      durationSeconds: r.durationSeconds ?? undefined,
      startedAt: r.startedAt?.toISOString(),
      endedAt: r.endedAt?.toISOString(),
    }));
  }

  @Get(':id/url')
  @RequirePermission(PERMISSIONS.RECORDINGS_READ)
  @ApiOperation({ summary: 'Signed URL for recording playback' })
  async url(@Param('id') id: string, @Req() req: Request): Promise<RecordingUrlResponseDto> {
    const user = getJwtUser(req);
    const url = await this.lifecycle.getSignedUrl(user.tenantId, id);
    return { url: url ?? undefined };
  }
}
