import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeviceStatus,
  DeviceType,
  DeviceManufacturer,
  LineStatus,
  PresenceStatus,
  ProvisioningStatus,
  RouteDestinationType,
  UserStatus,
  VoicemailStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../auth/password.util';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { ProvisioningRedisService } from '../../provisioning/redis/provisioning-redis.service';
import { normalizeMac } from '../../provisioning/vault/provisioning-vault.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  ProvisionSessionDeviceDto,
  ProvisionSessionDidDto,
  ProvisionSessionExtensionDto,
  ProvisionSessionUserDto,
  ProvisionSessionVoicemailDto,
} from '../dto/tenant-provision.dto';
import { TenantDidsService } from './tenant-dids.service';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { newPublicId } from '../utils/tenant.util';

export type ProvisionDraft = {
  sessionId: string;
  tenantId: string;
  userId: string;
  createdAt: string;
  user?: ProvisionSessionUserDto;
  extension?: ProvisionSessionExtensionDto;
  device?: ProvisionSessionDeviceDto;
  did?: ProvisionSessionDidDto;
  voicemail?: ProvisionSessionVoicemailDto;
};

const SESSION_TTL_SEC = 86_400;

@Injectable()
export class TenantProvisionService {
  constructor(
    private readonly redis: ProvisioningRedisService,
    private readonly prisma: PrismaService,
    private readonly dids: TenantDidsService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  private sessionKey(tenantId: string, sessionId: string) {
    return `vsp:${tenantId}:provision:session:${sessionId}`;
  }

  async createSession(tenantId: string, actorUserId: string): Promise<ProvisionDraft> {
    const sessionId = randomUUID();
    const draft: ProvisionDraft = {
      sessionId,
      tenantId,
      userId: actorUserId,
      createdAt: new Date().toISOString(),
    };
    await this.saveDraft(draft);
    return draft;
  }

  async getSession(tenantId: string, sessionId: string): Promise<ProvisionDraft> {
    const draft = await this.loadDraft(tenantId, sessionId);
    if (!draft) throw new NotFoundException('Provision session not found or expired');
    return draft;
  }

  async patchUser(tenantId: string, sessionId: string, dto: ProvisionSessionUserDto) {
    const draft = await this.getSession(tenantId, sessionId);
    draft.user = dto;
    await this.saveDraft(draft);
    return draft;
  }

  async patchExtension(tenantId: string, sessionId: string, dto: ProvisionSessionExtensionDto) {
    const draft = await this.getSession(tenantId, sessionId);
    draft.extension = dto;
    await this.saveDraft(draft);
    return draft;
  }

  async patchDevice(tenantId: string, sessionId: string, dto: ProvisionSessionDeviceDto) {
    const draft = await this.getSession(tenantId, sessionId);
    draft.device = dto;
    await this.saveDraft(draft);
    return draft;
  }

  async patchDid(tenantId: string, sessionId: string, dto: ProvisionSessionDidDto) {
    const draft = await this.getSession(tenantId, sessionId);
    draft.did = dto;
    await this.saveDraft(draft);
    return draft;
  }

  async patchVoicemail(tenantId: string, sessionId: string, dto: ProvisionSessionVoicemailDto) {
    const draft = await this.getSession(tenantId, sessionId);
    draft.voicemail = dto;
    await this.saveDraft(draft);
    return draft;
  }

  async commit(tenantId: string, actorUserId: string, sessionId: string) {
    const draft = await this.getSession(tenantId, sessionId);
    if (!draft.user) throw new BadRequestException('User step is required');
    if (!draft.extension) throw new BadRequestException('Extension step is required');
    if (!this.prisma.connected) throw new BadRequestException('Database unavailable');

    const email = draft.user.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email, deletedAt: null },
    });
    if (existing) throw new ConflictException('User email already exists for tenant');

    const result = await this.prisma.$transaction(async (tx) => {
      const userId = randomUUID();
      const lineId = randomUUID();
      const extensionId = randomUUID();
      const roleName = draft.user!.roleName?.trim() || 'User';

      await tx.user.create({
        data: {
          id: userId,
          publicId: newPublicId('u'),
          tenantId,
          email,
          passwordHash: hashPassword(draft.user!.password),
          status: UserStatus.ACTIVE,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      await tx.userProfile.create({
        data: {
          id: randomUUID(),
          tenantId,
          userId,
          firstName: draft.user!.firstName.trim(),
          lastName: draft.user!.lastName.trim(),
          displayName: `${draft.user!.firstName.trim()} ${draft.user!.lastName.trim()}`.trim(),
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });

      const role = await tx.role.findFirst({
        where: { tenantId, name: roleName, deletedAt: null },
      });
      if (role) {
        await tx.userRole.create({
          data: {
            id: randomUUID(),
            tenantId,
            userId,
            roleId: role.id,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          },
        });
      }

      const callerIdName =
        draft.extension!.callerIdName?.trim() ||
        `${draft.user!.firstName} ${draft.user!.lastName}`.trim();

      await tx.line.create({
        data: {
          id: lineId,
          publicId: newPublicId('line'),
          tenantId,
          userId,
          name: draft.extension!.lineName?.trim() || `Ext ${draft.extension!.extension}`,
          status: LineStatus.ACTIVE,
          createdBy: actorUserId,
          presence: {
            create: {
              id: randomUUID(),
              tenantId,
              status: PresenceStatus.OFFLINE,
              createdBy: actorUserId,
            },
          },
          callerId: {
            create: {
              id: randomUUID(),
              tenantId,
              callerIdName,
              createdBy: actorUserId,
            },
          },
          callPolicy: {
            create: {
              id: randomUUID(),
              tenantId,
              inboundEnabled: true,
              outboundEnabled: true,
              createdBy: actorUserId,
            },
          },
          recordingPolicy: {
            create: {
              id: randomUUID(),
              tenantId,
              recordingEnabled: false,
              recordInbound: false,
              recordOutbound: false,
              createdBy: actorUserId,
            },
          },
          telephonySettings: {
            create: {
              id: randomUUID(),
              tenantId,
              createdBy: actorUserId,
            },
          },
        },
      });

      const extension = await tx.extension.create({
        data: {
          id: extensionId,
          tenantId,
          lineId,
          extension: draft.extension!.extension,
          createdBy: actorUserId,
        },
      });

      let device = null;
      if (draft.device && !draft.device.skip && draft.device.macAddress?.trim()) {
        const mac = normalizeMac(draft.device.macAddress);
        const dup = await tx.device.findFirst({ where: { macAddress: mac, deletedAt: null } });
        if (dup) throw new BadRequestException('MAC address already in use');

        const deviceId = randomUUID();
        device = await tx.device.create({
          data: {
            id: deviceId,
            publicId: `dev_${deviceId.replace(/-/g, '').slice(0, 16)}`,
            tenantId,
            name: `${draft.user!.firstName} phone`,
            deviceType: (draft.device.deviceType as DeviceType) ?? DeviceType.DESK_PHONE,
            manufacturer: (draft.device.manufacturer as DeviceManufacturer) ?? DeviceManufacturer.GRANDSTREAM,
            model: draft.device.model ?? 'GRP2612',
            macAddress: mac,
            lineId,
            siteId: draft.user!.siteId,
            status: DeviceStatus.PROVISIONING,
            provisioningStatus: ProvisioningStatus.PENDING,
            createdBy: actorUserId,
          },
        });
      }

      let didResult = null;
      if (draft.did && !draft.did.skip && draft.did.phoneNumberId) {
        didResult = await this.dids.assignInTransaction(tx, tenantId, actorUserId, draft.did.phoneNumberId, {
          destinationType: (draft.did.destinationType ?? RouteDestinationType.LINE) as RouteDestinationType,
          destinationId: draft.did.destinationId ?? lineId,
          callerIdName: draft.did.callerIdName ?? callerIdName,
          siteId: draft.user!.siteId,
        });
      }

      let voicemail = null;
      if (
        draft.voicemail &&
        !draft.voicemail.skip &&
        draft.voicemail.enabled !== false
      ) {
        const vmId = randomUUID();
        voicemail = await tx.voicemail.create({
          data: {
            id: vmId,
            publicId: newPublicId('vm'),
            tenantId,
            lineId,
            name: `${draft.user!.firstName} ${draft.user!.lastName}`.trim(),
            mailboxType: 'PERSONAL',
            status: VoicemailStatus.ACTIVE,
            language: 'en',
            emailAttach: true,
            createdBy: actorUserId,
          },
        });
      }

      return {
        user: { id: userId, email },
        extension,
        device,
        did: didResult,
        voicemail,
      };
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId,
      action: 'pbx.provision.commit',
      entityType: 'User',
      entityId: result.user.id,
      metadata: { sessionId, extension: draft.extension!.extension },
    });

    await this.redis.del(this.sessionKey(tenantId, sessionId));

    return result;
  }

  private async saveDraft(draft: ProvisionDraft) {
    if (!this.redis.isAvailable()) {
      throw new BadRequestException('Draft storage unavailable — configure Redis for provision sessions');
    }
    await this.redis.setex(
      this.sessionKey(draft.tenantId, draft.sessionId),
      SESSION_TTL_SEC,
      JSON.stringify(draft),
    );
  }

  private async loadDraft(tenantId: string, sessionId: string): Promise<ProvisionDraft | null> {
    if (!this.redis.isAvailable()) return null;
    const raw = await this.redis.get(this.sessionKey(tenantId, sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as ProvisionDraft;
  }
}
