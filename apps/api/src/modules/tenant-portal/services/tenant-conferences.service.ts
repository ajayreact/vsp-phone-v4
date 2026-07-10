import { Injectable, NotFoundException } from '@nestjs/common';
import { ConferenceStatus, ConferenceType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import type {
  CloneConferenceDto,
  ConferenceParticipantActionDto,
  CreateConferenceDto,
  UpdateConferenceDto,
} from '../dto/tenant-conferences.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { newPublicId, tenantScope } from '../utils/tenant.util';

const conferenceInclude = {
  participants: {
    where: { deletedAt: null },
    include: {
      line: { select: { id: true, name: true, user: { select: { email: true, profile: { select: { displayName: true } } } } } },
    },
    orderBy: { joinedAt: 'desc' as const },
  },
} satisfies Prisma.ConferenceInclude;

@Injectable()
export class TenantConferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
    private readonly redis: TelecomRedisService,
  ) {}

  async list(tenantId: string, search?: string) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { code: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.conference.findMany({
      where,
      include: conferenceInclude,
      orderBy: { name: 'asc' },
      take: 500,
    });
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.conference.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: conferenceInclude,
    });
    if (!row) throw new NotFoundException('Conference not found');
    return row;
  }

  async create(tenantId: string, userId: string, dto: CreateConferenceDto) {
    const conf = await this.prisma.conference.create({
      data: {
        id: randomUUID(),
        publicId: newPublicId('conf'),
        tenantId,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        conferenceType: dto.conferenceType ?? ConferenceType.ROOM,
        pin: dto.pin,
        moderatorPin: dto.moderatorPin,
        recordingEnabled: dto.recordingEnabled ?? false,
        lobbyEnabled: dto.lobbyEnabled ?? false,
        waitingRoomEnabled: dto.waitingRoomEnabled ?? false,
        maxParticipants: dto.maxParticipants,
        lockRoom: dto.lockRoom ?? false,
        muteOnJoin: dto.muteOnJoin ?? false,
        mohPlaylistId: dto.mohPlaylistId,
        announcementId: dto.announcementId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        moderatorLineId: dto.moderatorLineId,
        status: dto.status ?? ConferenceStatus.ACTIVE,
        createdBy: userId,
      },
      include: conferenceInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.conference.create',
      entityType: 'Conference',
      entityId: conf.id,
      metadata: { name: dto.name, code: dto.code },
    });

    return conf;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateConferenceDto) {
    await this.require(tenantId, id);

    const conf = await this.prisma.conference.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.conferenceType !== undefined ? { conferenceType: dto.conferenceType } : {}),
        ...(dto.pin !== undefined ? { pin: dto.pin } : {}),
        ...(dto.moderatorPin !== undefined ? { moderatorPin: dto.moderatorPin } : {}),
        ...(dto.recordingEnabled !== undefined ? { recordingEnabled: dto.recordingEnabled } : {}),
        ...(dto.lobbyEnabled !== undefined ? { lobbyEnabled: dto.lobbyEnabled } : {}),
        ...(dto.waitingRoomEnabled !== undefined ? { waitingRoomEnabled: dto.waitingRoomEnabled } : {}),
        ...(dto.maxParticipants !== undefined ? { maxParticipants: dto.maxParticipants } : {}),
        ...(dto.lockRoom !== undefined ? { lockRoom: dto.lockRoom } : {}),
        ...(dto.muteOnJoin !== undefined ? { muteOnJoin: dto.muteOnJoin } : {}),
        ...(dto.mohPlaylistId !== undefined ? { mohPlaylistId: dto.mohPlaylistId } : {}),
        ...(dto.announcementId !== undefined ? { announcementId: dto.announcementId } : {}),
        ...(dto.scheduledAt !== undefined ? { scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null } : {}),
        ...(dto.moderatorLineId !== undefined ? { moderatorLineId: dto.moderatorLineId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
      include: conferenceInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.conference.update',
      entityType: 'Conference',
      entityId: conf.id,
    });

    return conf;
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.require(tenantId, id);
    const conf = await this.prisma.conference.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.conference.delete',
      entityType: 'Conference',
      entityId: conf.id,
    });

    return conf;
  }

  async clone(tenantId: string, userId: string, id: string, dto: CloneConferenceDto) {
    const source = await this.getById(tenantId, id);
    return this.create(tenantId, userId, {
      name: dto.name,
      code: dto.code,
      description: source.description ?? undefined,
      conferenceType: source.conferenceType,
      pin: source.pin ?? undefined,
      moderatorPin: source.moderatorPin ?? undefined,
      recordingEnabled: source.recordingEnabled,
      lobbyEnabled: source.lobbyEnabled,
      waitingRoomEnabled: source.waitingRoomEnabled,
      maxParticipants: source.maxParticipants ?? undefined,
      muteOnJoin: source.muteOnJoin,
      status: ConferenceStatus.INACTIVE,
    });
  }

  async getLive(tenantId: string, id: string) {
    const conf = await this.getById(tenantId, id);
    const liveRaw = await this.redis.get(this.redis.conferenceLiveKey(tenantId, id));
    const live = liveRaw ? (JSON.parse(liveRaw) as Record<string, unknown>) : null;

    const activeParticipants = conf.participants.filter((p) => p.status === 'JOINED');
    const startedAt = activeParticipants.reduce<Date | null>((earliest, p) => {
      if (!p.joinedAt) return earliest;
      return !earliest || p.joinedAt < earliest ? p.joinedAt : earliest;
    }, null);

    return {
      conferenceId: id,
      live,
      participantCount: activeParticipants.length,
      participants: activeParticipants.map((p) => ({
        id: p.id,
        lineId: p.lineId,
        lineName: p.line?.name,
        muted: p.muted,
        joinedAt: p.joinedAt,
        status: p.status,
      })),
      durationSec: startedAt ? Math.floor((Date.now() - startedAt.getTime()) / 1000) : 0,
      recordingEnabled: conf.recordingEnabled,
      lockRoom: conf.lockRoom,
    };
  }

  async updateParticipant(
    tenantId: string,
    userId: string,
    conferenceId: string,
    participantId: string,
    dto: ConferenceParticipantActionDto,
  ) {
    await this.require(tenantId, conferenceId);
    const participant = await this.prisma.conferenceParticipant.findFirst({
      where: { id: participantId, tenantId, conferenceId, deletedAt: null },
    });
    if (!participant) throw new NotFoundException('Participant not found');

    const updated = await this.prisma.conferenceParticipant.update({
      where: { id: participantId },
      data: {
        ...(dto.muted !== undefined ? { muted: dto.muted, status: dto.muted ? 'MUTED' : 'JOINED' } : {}),
        updatedBy: userId,
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.conference.participant.update',
      entityType: 'ConferenceParticipant',
      entityId: participantId,
    });

    return updated;
  }

  async removeParticipant(tenantId: string, userId: string, conferenceId: string, participantId: string) {
    await this.require(tenantId, conferenceId);
    const updated = await this.prisma.conferenceParticipant.update({
      where: { id: participantId },
      data: { status: 'LEFT', leftAt: new Date(), updatedBy: userId },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.conference.participant.remove',
      entityType: 'ConferenceParticipant',
      entityId: participantId,
    });

    return updated;
  }

  async getReports(tenantId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000);

    const [rooms, sessions, participants] = await Promise.all([
      this.prisma.conference.count({ where: { ...tenantScope(tenantId) } }),
      this.prisma.callSession.count({ where: { tenantId, conferenceId: { not: null }, startedAt: { gte: since } } }),
      this.prisma.conferenceParticipant.count({
        where: { tenantId, joinedAt: { gte: since } },
      }),
    ]);

    return { periodDays: days, conferenceRooms: rooms, sessions, participantJoins: participants };
  }

  private async require(tenantId: string, id: string) {
    const row = await this.prisma.conference.findFirst({ where: { id, ...tenantScope(tenantId) } });
    if (!row) throw new NotFoundException('Conference not found');
    return row;
  }
}
