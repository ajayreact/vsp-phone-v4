import { Injectable, NotFoundException } from '@nestjs/common';
import { AudioAssetCategory, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { ObjectStorageService } from '../../recording/storage/object-storage.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  CreateAnnouncementDto,
  CreateMohPlaylistDto,
  CreateMohTrackDto,
  PresignAudioUploadDto,
  UpdateAnnouncementDto,
} from '../dto/tenant-audio-library.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { tenantScope } from '../utils/tenant.util';

@Injectable()
export class TenantAudioLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
    private readonly storage: ObjectStorageService,
  ) {}

  async listAnnouncements(tenantId: string, category?: AudioAssetCategory) {
    if (!this.prisma.connected) return [];
    return this.prisma.announcement.findMany({
      where: {
        ...tenantScope(tenantId),
        ...(category ? { category } : {}),
      },
      orderBy: { name: 'asc' },
      take: 500,
    });
  }

  async getAnnouncement(tenantId: string, id: string) {
    const row = await this.prisma.announcement.findFirst({
      where: { id, ...tenantScope(tenantId) },
    });
    if (!row) throw new NotFoundException('Announcement not found');
    return row;
  }

  async createAnnouncement(tenantId: string, userId: string, dto: CreateAnnouncementDto) {
    const ann = await this.prisma.announcement.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: dto.name,
        description: dto.description,
        category: dto.category ?? AudioAssetCategory.PROMPT,
        language: dto.language ?? 'en',
        mediaObjectKey: dto.mediaObjectKey,
        ttsText: dto.ttsText,
        ttsVoice: dto.ttsVoice,
        createdBy: userId,
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.audio.announcement.create',
      entityType: 'Announcement',
      entityId: ann.id,
      metadata: { name: dto.name, category: ann.category },
    });

    return ann;
  }

  async updateAnnouncement(tenantId: string, userId: string, id: string, dto: UpdateAnnouncementDto) {
    await this.getAnnouncement(tenantId, id);

    const ann = await this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.language !== undefined ? { language: dto.language } : {}),
        ...(dto.mediaObjectKey !== undefined ? { mediaObjectKey: dto.mediaObjectKey } : {}),
        ...(dto.ttsText !== undefined ? { ttsText: dto.ttsText } : {}),
        ...(dto.ttsVoice !== undefined ? { ttsVoice: dto.ttsVoice } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.audio.announcement.update',
      entityType: 'Announcement',
      entityId: ann.id,
    });

    return ann;
  }

  async removeAnnouncement(tenantId: string, userId: string, id: string) {
    await this.getAnnouncement(tenantId, id);
    const ann = await this.prisma.announcement.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.audio.announcement.delete',
      entityType: 'Announcement',
      entityId: ann.id,
    });

    return ann;
  }

  async presignUpload(tenantId: string, dto: PresignAudioUploadDto) {
    const ext = dto.filename.split('.').pop() ?? 'wav';
    const objectKey = `prompts/${tenantId}/${randomUUID()}.${ext}`;
    const url = await this.storage.signedUrl(objectKey, 3600);
    return { objectKey, uploadUrl: url, expiresIn: 3600 };
  }

  async getPreviewUrl(tenantId: string, id: string) {
    const ann = await this.getAnnouncement(tenantId, id);
    if (!ann.mediaObjectKey) return { url: null };
    const url = await this.storage.signedUrl(ann.mediaObjectKey, 900);
    return { url, announcementId: id };
  }

  async listMohPlaylists(tenantId: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.mohPlaylist.findMany({
      where: tenantScope(tenantId),
      include: { tracks: { where: { deletedAt: null }, orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createMohPlaylist(tenantId: string, userId: string, dto: CreateMohPlaylistDto) {
    const playlist = await this.prisma.mohPlaylist.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: dto.name,
        isDefault: dto.isDefault ?? false,
      },
      include: { tracks: true },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.audio.moh_playlist.create',
      entityType: 'MohPlaylist',
      entityId: playlist.id,
    });

    return playlist;
  }

  async createMohTrack(tenantId: string, userId: string, dto: CreateMohTrackDto) {
    const track = await this.prisma.mohTrack.create({
      data: {
        id: randomUUID(),
        tenantId,
        playlistId: dto.playlistId,
        name: dto.name,
        mediaObjectKey: dto.mediaObjectKey,
        durationSec: dto.durationSec,
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.audio.moh_track.create',
      entityType: 'MohTrack',
      entityId: track.id,
    });

    return track;
  }

  async removeMohTrack(tenantId: string, userId: string, id: string) {
    const track = await this.prisma.mohTrack.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!track) throw new NotFoundException('MOH track not found');

    const updated = await this.prisma.mohTrack.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.audio.moh_track.delete',
      entityType: 'MohTrack',
      entityId: updated.id,
    });

    return updated;
  }
}
