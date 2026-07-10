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
import { AudioAssetCategory } from '@prisma/client';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import {
  CreateAnnouncementDto,
  CreateMohPlaylistDto,
  CreateMohTrackDto,
  PresignAudioUploadDto,
  UpdateAnnouncementDto,
} from '../dto/tenant-audio-library.dto';
import { TenantAudioLibraryService } from '../services/tenant-audio-library.service';

@ApiTags('tenant-audio-library')
@ApiBearerAuth()
@Controller('v1/tenant/audio')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantAudioLibraryController {
  constructor(private readonly audio: TenantAudioLibraryService) {}

  @Get('announcements')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  async listAnnouncements(@Req() req: Request, @Query('category') category?: AudioAssetCategory) {
    const user = getJwtUser(req);
    const data = await this.audio.listAnnouncements(user.tenantId, category);
    return { data };
  }

  @Get('announcements/:id')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  getAnnouncement(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.getAnnouncement(user.tenantId, id);
  }

  @Get('announcements/:id/preview')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  preview(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.getPreviewUrl(user.tenantId, id);
  }

  @Post('announcements')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  createAnnouncement(@Body() dto: CreateAnnouncementDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.createAnnouncement(user.tenantId, user.sub, dto);
  }

  @Post('upload/presign')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  presign(@Body() dto: PresignAudioUploadDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.presignUpload(user.tenantId, dto);
  }

  @Patch('announcements/:id')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  updateAnnouncement(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.updateAnnouncement(user.tenantId, user.sub, id, dto);
  }

  @Delete('announcements/:id')
  @RequireAnyPermission(PERMISSIONS.TENANT_IVR_WRITE, PERMISSIONS.TENANT_ADMIN)
  removeAnnouncement(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.removeAnnouncement(user.tenantId, user.sub, id);
  }

  @Get('moh/playlists')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  async listMoh(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.audio.listMohPlaylists(user.tenantId);
    return { data };
  }

  @Post('moh/playlists')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  createMohPlaylist(@Body() dto: CreateMohPlaylistDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.createMohPlaylist(user.tenantId, user.sub, dto);
  }

  @Post('moh/tracks')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  createMohTrack(@Body() dto: CreateMohTrackDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.createMohTrack(user.tenantId, user.sub, dto);
  }

  @Delete('moh/tracks/:id')
  @RequireAnyPermission(PERMISSIONS.TENANT_IVR_WRITE, PERMISSIONS.TENANT_ADMIN)
  removeMohTrack(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.removeMohTrack(user.tenantId, user.sub, id);
  }
}
