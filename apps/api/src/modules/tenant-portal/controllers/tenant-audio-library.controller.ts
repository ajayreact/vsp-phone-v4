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
import { AudioAssetCategory, MohScope } from '@prisma/client';
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
  ReplaceAnnouncementDto,
  ReorderMohTracksDto,
  UpdateAnnouncementDto,
  UpdateMohPlaylistDto,
} from '../dto/tenant-audio-library.dto';
import { TenantAudioLibraryService } from '../services/tenant-audio-library.service';

@ApiTags('tenant-audio-library')
@ApiBearerAuth()
@Controller('v1/tenant/audio')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantAudioLibraryController {
  constructor(private readonly audio: TenantAudioLibraryService) {}

  @Get('reports')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  reports(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.getAudioReports(user.tenantId);
  }

  @Get('announcements')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  async listAnnouncements(
    @Req() req: Request,
    @Query('category') category?: AudioAssetCategory,
    @Query('language') language?: string,
  ) {
    const user = getJwtUser(req);
    const data = await this.audio.listAnnouncements(user.tenantId, category, language);
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

  @Get('announcements/:id/versions')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  async announcementVersions(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.audio.listAnnouncementVersions(user.tenantId, id);
    return { data };
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

  @Post('announcements/:id/replace')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  replaceAnnouncement(
    @Param('id') id: string,
    @Body() dto: ReplaceAnnouncementDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.audio.replaceAnnouncement(user.tenantId, user.sub, id, dto);
  }

  @Delete('announcements/:id')
  @RequireAnyPermission(PERMISSIONS.TENANT_IVR_WRITE, PERMISSIONS.TENANT_ADMIN)
  removeAnnouncement(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.removeAnnouncement(user.tenantId, user.sub, id);
  }

  @Get('moh/playlists')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  async listMoh(
    @Req() req: Request,
    @Query('scope') scope?: MohScope,
    @Query('language') language?: string,
  ) {
    const user = getJwtUser(req);
    const data = await this.audio.listMohPlaylists(user.tenantId, scope, language);
    return { data };
  }

  @Get('moh/assignments')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  mohAssignments(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.getMohAssignments(user.tenantId);
  }

  @Get('moh/playlists/:id')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  getMohPlaylist(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.getMohPlaylist(user.tenantId, id);
  }

  @Get('moh/playlists/:id/versions')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  async mohVersions(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.audio.listMohPlaylistVersions(user.tenantId, id);
    return { data };
  }

  @Post('moh/playlists')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  createMohPlaylist(@Body() dto: CreateMohPlaylistDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.createMohPlaylist(user.tenantId, user.sub, dto);
  }

  @Patch('moh/playlists/:id')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  updateMohPlaylist(@Param('id') id: string, @Body() dto: UpdateMohPlaylistDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.updateMohPlaylist(user.tenantId, user.sub, id, dto);
  }

  @Delete('moh/playlists/:id')
  @RequireAnyPermission(PERMISSIONS.TENANT_IVR_WRITE, PERMISSIONS.TENANT_ADMIN)
  removeMohPlaylist(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.removeMohPlaylist(user.tenantId, user.sub, id);
  }

  @Post('moh/tracks')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  createMohTrack(@Body() dto: CreateMohTrackDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.createMohTrack(user.tenantId, user.sub, dto);
  }

  @Post('moh/playlists/:id/reorder')
  @RequirePermission(PERMISSIONS.TENANT_IVR_WRITE)
  reorderMohTracks(@Param('id') id: string, @Body() dto: ReorderMohTracksDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.reorderMohTracks(user.tenantId, user.sub, id, dto);
  }

  @Get('moh/tracks/:id/preview')
  @RequirePermission(PERMISSIONS.TENANT_IVR_READ)
  previewMohTrack(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.getMohTrackPreview(user.tenantId, id);
  }

  @Delete('moh/tracks/:id')
  @RequireAnyPermission(PERMISSIONS.TENANT_IVR_WRITE, PERMISSIONS.TENANT_ADMIN)
  removeMohTrack(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.audio.removeMohTrack(user.tenantId, user.sub, id);
  }
}
