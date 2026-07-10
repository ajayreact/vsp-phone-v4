import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AudioAssetCategory, MohPlayMode, MohScope, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { ObjectStorageService } from '../../recording/storage/object-storage.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  CreateAnnouncementDto,
  CreateMohPlaylistDto,
  CreateMohTrackDto,
  PresignAudioUploadDto,
  ReplaceAnnouncementDto,
  ReorderMohTracksDto,
  UpdateAnnouncementDto,
  UpdateMohPlaylistDto,
} from '../dto/tenant-audio-library.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { tenantScope } from '../utils/tenant.util';

const mohInclude = {
  tracks: { where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
} satisfies Prisma.MohPlaylistInclude;

@Injectable()
export class TenantAudioLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
    private readonly storage: ObjectStorageService,
  ) {}

  async listAnnouncements(tenantId: string, category?: AudioAssetCategory, language?: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.announcement.findMany({
      where: {
        ...tenantScope(tenantId),
        ...(category ? { category } : {}),
        ...(language ? { language } : {}),
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
        isEmergency: dto.isEmergency ?? false,
        tags: dto.tags?.length ? dto.tags : undefined,
        createdBy: userId,
      },
    });

    await this.snapshotAnnouncementVersion(tenantId, ann.id, userId, 'Initial version');

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
    const before = await this.getAnnouncement(tenantId, id);

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
        ...(dto.isEmergency !== undefined ? { isEmergency: dto.isEmergency } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });

    if (
      dto.mediaObjectKey !== undefined ||
      dto.ttsText !== undefined ||
      dto.name !== undefined
    ) {
      await this.snapshotAnnouncementVersion(tenantId, id, userId);
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.audio.announcement.update',
      entityType: 'Announcement',
      entityId: ann.id,
      metadata: { previousVersion: before.version },
    });

    return ann;
  }

  async replaceAnnouncement(
    tenantId: string,
    userId: string,
    id: string,
    dto: ReplaceAnnouncementDto,
  ) {
    await this.getAnnouncement(tenantId, id);
    const ann = await this.prisma.announcement.update({
      where: { id },
      data: {
        mediaObjectKey: dto.mediaObjectKey,
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
    await this.snapshotAnnouncementVersion(tenantId, id, userId, dto.changeNotes);
    return ann;
  }

  async listAnnouncementVersions(tenantId: string, id: string) {
    await this.getAnnouncement(tenantId, id);
    return this.prisma.announcementVersion.findMany({
      where: { announcementId: id, tenantId },
      orderBy: { version: 'desc' },
      take: 50,
    });
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

  async getMohTrackPreview(tenantId: string, trackId: string) {
    const track = await this.prisma.mohTrack.findFirst({
      where: { id: trackId, ...tenantScope(tenantId), deletedAt: null },
    });
    if (!track) throw new NotFoundException('MOH track not found');
    const url = await this.storage.signedUrl(track.mediaObjectKey, 900);
    return { url, trackId };
  }

  async listMohPlaylists(tenantId: string, scope?: MohScope, language?: string) {
    if (!this.prisma.connected) return [];
    return this.prisma.mohPlaylist.findMany({
      where: {
        ...tenantScope(tenantId),
        ...(scope ? { scope } : {}),
        ...(language ? { language } : {}),
      },
      include: mohInclude,
      orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }, { name: 'asc' }],
    });
  }

  async getMohPlaylist(tenantId: string, id: string) {
    const row = await this.prisma.mohPlaylist.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: mohInclude,
    });
    if (!row) throw new NotFoundException('MOH playlist not found');
    return row;
  }

  async createMohPlaylist(tenantId: string, userId: string, dto: CreateMohPlaylistDto) {
    if (dto.isDefault) {
      await this.prisma.mohPlaylist.updateMany({
        where: { tenantId, deletedAt: null, isDefault: true },
        data: { isDefault: false },
      });
    }

    const playlist = await this.prisma.mohPlaylist.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: dto.name,
        isDefault: dto.isDefault ?? false,
        playMode: dto.playMode ?? MohPlayMode.SEQUENTIAL,
        language: dto.language ?? 'en',
        streamingUrl: dto.streamingUrl,
        priority: dto.priority ?? 100,
        scope: dto.scope ?? MohScope.TENANT,
        scheduledFrom: dto.scheduledFrom ? new Date(dto.scheduledFrom) : undefined,
        scheduledTo: dto.scheduledTo ? new Date(dto.scheduledTo) : undefined,
      },
      include: mohInclude,
    });

    await this.snapshotMohPlaylistVersion(tenantId, playlist.id, userId, 'Initial version');

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.audio.moh_playlist.create',
      entityType: 'MohPlaylist',
      entityId: playlist.id,
    });

    return playlist;
  }

  async updateMohPlaylist(tenantId: string, userId: string, id: string, dto: UpdateMohPlaylistDto) {
    await this.getMohPlaylist(tenantId, id);

    if (dto.isDefault) {
      await this.prisma.mohPlaylist.updateMany({
        where: { tenantId, deletedAt: null, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const playlist = await this.prisma.mohPlaylist.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.playMode !== undefined ? { playMode: dto.playMode } : {}),
        ...(dto.language !== undefined ? { language: dto.language } : {}),
        ...(dto.streamingUrl !== undefined ? { streamingUrl: dto.streamingUrl } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
        ...(dto.scheduledFrom !== undefined
          ? { scheduledFrom: dto.scheduledFrom ? new Date(dto.scheduledFrom) : null }
          : {}),
        ...(dto.scheduledTo !== undefined
          ? { scheduledTo: dto.scheduledTo ? new Date(dto.scheduledTo) : null }
          : {}),
        version: { increment: 1 },
      },
      include: mohInclude,
    });

    await this.snapshotMohPlaylistVersion(tenantId, id, userId, dto.changeNotes);

    return playlist;
  }

  async removeMohPlaylist(tenantId: string, userId: string, id: string) {
    await this.getMohPlaylist(tenantId, id);
    return this.prisma.mohPlaylist.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async listMohPlaylistVersions(tenantId: string, id: string) {
    await this.getMohPlaylist(tenantId, id);
    return this.prisma.mohPlaylistVersion.findMany({
      where: { playlistId: id, tenantId },
      orderBy: { version: 'desc' },
      take: 50,
    });
  }

  async createMohTrack(tenantId: string, userId: string, dto: CreateMohTrackDto) {
    if (dto.playlistId) await this.getMohPlaylist(tenantId, dto.playlistId);

    const maxOrder = dto.playlistId
      ? await this.prisma.mohTrack.aggregate({
          where: { playlistId: dto.playlistId, deletedAt: null },
          _max: { sortOrder: true },
        })
      : { _max: { sortOrder: 0 } };

    const track = await this.prisma.mohTrack.create({
      data: {
        id: randomUUID(),
        tenantId,
        playlistId: dto.playlistId,
        name: dto.name,
        mediaObjectKey: dto.mediaObjectKey,
        durationSec: dto.durationSec,
        sortOrder: dto.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
        trackPriority: dto.trackPriority ?? 0,
      },
    });

    if (dto.playlistId) {
      await this.prisma.mohPlaylist.update({
        where: { id: dto.playlistId },
        data: { version: { increment: 1 } },
      });
      await this.snapshotMohPlaylistVersion(tenantId, dto.playlistId, userId, `Added track ${dto.name}`);
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.audio.moh_track.create',
      entityType: 'MohTrack',
      entityId: track.id,
    });

    return track;
  }

  async reorderMohTracks(tenantId: string, userId: string, playlistId: string, dto: ReorderMohTracksDto) {
    await this.getMohPlaylist(tenantId, playlistId);
    if (!dto.trackIds.length) throw new BadRequestException('trackIds required');

    await this.prisma.$transaction(
      dto.trackIds.map((trackId, index) =>
        this.prisma.mohTrack.updateMany({
          where: { id: trackId, playlistId, tenantId, deletedAt: null },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    await this.snapshotMohPlaylistVersion(tenantId, playlistId, userId, 'Reordered tracks');
    return this.getMohPlaylist(tenantId, playlistId);
  }

  async removeMohTrack(tenantId: string, userId: string, id: string) {
    const track = await this.prisma.mohTrack.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!track) throw new NotFoundException('MOH track not found');

    const updated = await this.prisma.mohTrack.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    if (track.playlistId) {
      await this.snapshotMohPlaylistVersion(tenantId, track.playlistId, userId, `Removed track ${track.name}`);
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.audio.moh_track.delete',
      entityType: 'MohTrack',
      entityId: updated.id,
    });

    return updated;
  }

  async getMohAssignments(tenantId: string) {
    const [queues, ringGroups, conferences, defaultPlaylist] = await Promise.all([
      this.prisma.queue.findMany({
        where: { tenantId, deletedAt: null, mohPlaylistId: { not: null } },
        select: { id: true, name: true, code: true, mohPlaylistId: true },
      }),
      this.prisma.ringGroup.findMany({
        where: { tenantId, deletedAt: null, mohPlaylistId: { not: null } },
        select: { id: true, name: true, extension: true, mohPlaylistId: true },
      }),
      this.prisma.conference.findMany({
        where: { tenantId, deletedAt: null, mohPlaylistId: { not: null } },
        select: { id: true, name: true, code: true, mohPlaylistId: true },
      }),
      this.prisma.mohPlaylist.findFirst({
        where: { tenantId, deletedAt: null, isDefault: true },
        select: { id: true, name: true },
      }),
    ]);

    const ivrs = await this.prisma.iVR.findMany({
      where: { tenantId, deletedAt: null, greetingAnnouncementId: { not: null } },
      select: { id: true, name: true, code: true, greetingAnnouncementId: true },
    });

    return {
      defaultPlaylist,
      queues,
      ringGroups,
      ivrs,
      conferences,
    };
  }

  async getAudioReports(tenantId: string) {
    const [announcementCount, mohPlaylistCount, mohTrackCount, emergencyCount] = await Promise.all([
      this.prisma.announcement.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.mohPlaylist.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.mohTrack.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.announcement.count({ where: { tenantId, deletedAt: null, isEmergency: true } }),
    ]);

    return { announcementCount, mohPlaylistCount, mohTrackCount, emergencyCount };
  }

  private async snapshotAnnouncementVersion(
    tenantId: string,
    announcementId: string,
    userId: string,
    changeNotes?: string,
  ) {
    const ann = await this.getAnnouncement(tenantId, announcementId);
    await this.prisma.announcementVersion.create({
      data: {
        id: randomUUID(),
        tenantId,
        announcementId,
        version: ann.version,
        name: ann.name,
        mediaObjectKey: ann.mediaObjectKey,
        ttsText: ann.ttsText,
        changeNotes,
        createdBy: userId,
      },
    });
  }

  private async snapshotMohPlaylistVersion(
    tenantId: string,
    playlistId: string,
    userId: string,
    changeNotes?: string,
  ) {
    const playlist = await this.getMohPlaylist(tenantId, playlistId);
    await this.prisma.mohPlaylistVersion.create({
      data: {
        id: randomUUID(),
        tenantId,
        playlistId,
        version: playlist.version,
        snapshot: playlist as unknown as Prisma.InputJsonValue,
        changeNotes,
        createdBy: userId,
      },
    });
  }
}
