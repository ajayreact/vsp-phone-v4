import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeviceType,
  DeviceStatus,
  PresenceStatus,
  Prisma,
  ProvisioningStatus,
  RouteDestinationType,
  SIPEndpointStatus,
} from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import type { JwtPayload } from '../../auth/jwt.util';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { SipCredentialVaultService } from '../../telecom/auth/sip-credential-vault.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import type {
  BulkImportExtensionsDto,
  CreateExtensionDto,
  RenameExtensionDisplayNameDto,
  UpdateExtensionDto,
} from '../dto/tenant-extensions.dto';
import {
  extensionNeedsBusinessSetup,
  tombstoneExtensionNumber,
} from '../utils/extension-auto-provision.util';
import { ExtensionAutoProvisionService } from './extension-auto-provision.service';
import { LineSipEndpointService } from './line-sip-endpoint.service';
import { TenantLinesService } from './tenant-lines.service';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { formatExtensionLabel, formatRelativeTime } from '../utils/format-extension-label';
import { newPublicId, tenantScope } from '../utils/tenant.util';

export type ExtensionHubStatus = 'Registered' | 'Provisioned' | 'NoDevice' | 'RegistrationFailed';

export type ExtensionHubStats = {
  totalExtensions: number;
  assignedDids: number;
  registeredDevices: number;
  offlineDevices: number;
  unassignedExtensions: number;
  mobileApps: number;
  deskPhones: number;
};

export type ExtensionHubRow = {
  id: string;
  lineId: string;
  extension: string;
  displayName: string;
  label: string;
  description: string | null;
  department: { id: string; name: string } | null;
  did: { id: string; number: string; formatted: string } | null;
  device: {
    id: string;
    name: string;
    deviceType: string;
    manufacturer: string | null;
    model: string | null;
    registrationStatus: string;
    deviceLabel: string;
  } | null;
  hasMobileApp: boolean;
  hasDeskPhone: boolean;
  status: ExtensionHubStatus;
  statusLabel: string;
  onlineStatus: 'Online' | 'Offline';
  registrationLabel: string;
  lastCallAt: string | null;
  lastCallRelative: string | null;
  lastRegistrationAt: string | null;
  provisionLabel: string;
  recordingEnabled: boolean;
  voicemailEnabled: boolean;
  linkedUser: { id: string; email: string; displayName: string | null } | null;
};

const extensionInclude = {
  department: { select: { id: true, name: true } },
  line: {
    include: {
      user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true, displayName: true } } } },
      presence: true,
      callerId: { include: { phoneNumber: { select: { id: true, number: true } } } },
      telephonySettings: true,
      voicemail: { select: { id: true, status: true, pin: true } },
      callPolicy: true,
      recordingPolicy: true,
      phoneNumbers: { where: { deletedAt: null }, select: { id: true, number: true }, take: 1 },
      devices: {
        where: { deletedAt: null },
        include: {
          sipEndpoint: {
            select: { registrationStatus: true, lastRegisteredAt: true, authUsername: true, aor: true },
          },
        },
        orderBy: { updatedAt: 'desc' as const },
      },
    },
  },
} as const;

@Injectable()
export class TenantExtensionsService {
  private readonly enrollTtlSec: number;
  private readonly platformDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lines: TenantLinesService,
    private readonly audit: EnterpriseAuditService,
    private readonly autoProvision: ExtensionAutoProvisionService,
    private readonly lineSip: LineSipEndpointService,
    private readonly vault: SipCredentialVaultService,
    private readonly redis: TelecomRedisService,
    private readonly config: ConfigService,
  ) {
    this.enrollTtlSec = Number(config.get('WEBRTC_ENROLL_TTL_SEC') ?? '900');
    this.platformDomain = config.get<string>('SIP_PLATFORM_DOMAIN', 'vsp.internal');
  }

  async list(tenantId: string, search?: string) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.OR = [
        { extension: { contains: search.trim(), mode: 'insensitive' } },
        { line: { name: { contains: search.trim(), mode: 'insensitive' } } },
      ];
    }

    const rows = await this.prisma.extension.findMany({
      where,
      include: extensionInclude,
      orderBy: { extension: 'asc' },
      take: 1000,
    });

    return rows.map((row) => ({
      ...row,
      label: formatExtensionLabel(row.extension, row.line.name),
    }));
  }

  async listHub(tenantId: string, search?: string): Promise<ExtensionHubRow[]> {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.OR = [
        { extension: { contains: search.trim(), mode: 'insensitive' } },
        { line: { name: { contains: search.trim(), mode: 'insensitive' } } },
      ];
    }

    const rows = await this.prisma.extension.findMany({
      where,
      include: extensionInclude,
      orderBy: { extension: 'asc' },
      take: 1000,
    });

    const lineIds = rows.map((r) => r.lineId);
    const lastCallMap = await this.loadLastCallMap(tenantId, lineIds);

    return rows.map((row) => this.toHubRow(row, lastCallMap.get(row.lineId) ?? null));
  }

  async hubStats(tenantId: string): Promise<ExtensionHubStats> {
    const rows = await this.listHub(tenantId);
    return {
      totalExtensions: rows.length,
      assignedDids: rows.filter((r) => r.did).length,
      registeredDevices: rows.filter((r) => r.status === 'Registered').length,
      offlineDevices: rows.filter((r) => r.device && r.status !== 'Registered').length,
      // Needs Setup: business config incomplete (or legacy NoDevice)
      unassignedExtensions: rows.filter((r) =>
        extensionNeedsBusinessSetup({
          extension: r.extension,
          displayName: r.displayName,
          hasLinkedUser: Boolean(r.linkedUser),
          status: r.status,
        }),
      ).length,
      mobileApps: rows.filter((r) => r.hasMobileApp).length,
      deskPhones: rows.filter((r) => r.hasDeskPhone).length,
    };
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.extension.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: extensionInclude,
    });
    if (!row) throw new NotFoundException('Extension not found');
    return { ...row, label: formatExtensionLabel(row.extension, row.line.name) };
  }

  async create(tenantId: string, userId: string, dto: CreateExtensionDto) {
    let lineId = dto.lineId;

    if (!lineId) {
      const displayName =
        dto.displayName?.trim() ||
        dto.lineName?.trim() ||
        this.autoProvision.defaultDisplayName(dto.extension);

      if (dto.userId) {
        const line = await this.lines.create(tenantId, userId, {
          userId: dto.userId,
          name: displayName,
          callerIdName: dto.callerIdName,
          phoneNumberId: dto.phoneNumberId,
          emergencyCallerIdName: dto.emergencyCallerIdName,
          settings: dto.settings,
        });
        lineId = line.id;
      } else {
        const ext = await this.autoProvision.ensureExtension(tenantId, dto.extension, userId, {
          displayName,
          description: dto.description,
          departmentId: dto.departmentId,
          phoneNumberId: dto.phoneNumberId,
        });
        return this.getById(tenantId, ext.id);
      }
    } else if (dto.settings || dto.callerIdName || dto.emergencyCallerIdName || dto.phoneNumberId || dto.displayName) {
      await this.lines.update(tenantId, userId, lineId, {
        name: dto.displayName ?? dto.lineName,
        callerIdName: dto.callerIdName,
        phoneNumberId: dto.phoneNumberId,
        emergencyCallerIdName: dto.emergencyCallerIdName,
        settings: dto.settings,
      });
    }

    const existingExt = await this.prisma.extension.findFirst({
      where: { lineId, tenantId, deletedAt: null },
    });
    if (existingExt) {
      throw new BadRequestException('Line already has an extension');
    }

    const extension = await this.prisma.extension.create({
      data: {
        id: randomUUID(),
        tenantId,
        lineId,
        extension: dto.extension,
        description: dto.description?.trim() || null,
        departmentId: dto.departmentId ?? null,
        createdBy: userId,
      },
      include: extensionInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.extension.create',
      entityType: 'Extension',
      entityId: extension.id,
      metadata: { extension: dto.extension, lineId },
    });

    return { ...extension, label: formatExtensionLabel(extension.extension, extension.line.name) };
  }

  async renameDisplayName(
    tenantId: string,
    userId: string,
    id: string,
    dto: RenameExtensionDisplayNameDto,
  ) {
    const existing = await this.require(tenantId, id);
    const displayName = dto.displayName.trim();

    await this.prisma.$transaction(async (tx) => {
      await tx.line.update({
        where: { id: existing.lineId },
        data: { name: displayName, updatedBy: userId, version: { increment: 1 } },
      });
      await tx.extension.update({
        where: { id: existing.id },
        data: {
          description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
          departmentId: dto.departmentId !== undefined ? dto.departmentId : undefined,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.extension.rename',
      entityType: 'Extension',
      entityId: id,
      metadata: { displayName },
    });

    return this.getById(tenantId, id);
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateExtensionDto) {
    const existing = await this.require(tenantId, id);

    if (dto.extension !== undefined) {
      await this.prisma.extension.update({
        where: { id: existing.id },
        data: { extension: dto.extension, updatedBy: userId, version: { increment: 1 } },
      });
    }

    if (dto.description !== undefined || dto.departmentId !== undefined) {
      await this.prisma.extension.update({
        where: { id: existing.id },
        data: {
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    }

    if (dto.userId !== undefined) {
      await this.prisma.line.update({
        where: { id: existing.lineId },
        data: { userId: dto.userId, updatedBy: userId, version: { increment: 1 } },
      });
    }

    const linePatch: Parameters<TenantLinesService['update']>[3] = {};
    if (dto.displayName !== undefined) linePatch.name = dto.displayName;
    if (dto.callerIdName !== undefined) linePatch.callerIdName = dto.callerIdName;
    if (dto.phoneNumberId !== undefined) linePatch.phoneNumberId = dto.phoneNumberId;
    if (dto.emergencyCallerIdName !== undefined) linePatch.emergencyCallerIdName = dto.emergencyCallerIdName;
    if (dto.settings) linePatch.settings = dto.settings;

    if (Object.keys(linePatch).length) {
      await this.lines.update(tenantId, userId, existing.lineId, linePatch);
    }

    if (dto.inboundEnabled !== undefined || dto.outboundEnabled !== undefined) {
      await this.prisma.callPolicy.updateMany({
        where: { lineId: existing.lineId, tenantId, deletedAt: null },
        data: {
          ...(dto.inboundEnabled !== undefined ? { inboundEnabled: dto.inboundEnabled } : {}),
          ...(dto.outboundEnabled !== undefined ? { outboundEnabled: dto.outboundEnabled } : {}),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    }

    if (dto.recordingEnabled !== undefined) {
      await this.prisma.recordingPolicy.updateMany({
        where: { lineId: existing.lineId, tenantId, deletedAt: null },
        data: {
          recordingEnabled: dto.recordingEnabled,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    }

    if (dto.voicemailEnabled !== undefined) {
      await this.prisma.voicemail.updateMany({
        where: { lineId: existing.lineId, tenantId, deletedAt: null },
        data: {
          status: dto.voicemailEnabled ? 'ACTIVE' : 'INACTIVE',
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.extension.update',
      entityType: 'Extension',
      entityId: id,
    });

    return this.getById(tenantId, id);
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.require(tenantId, id);
    const lineId = existing.lineId;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const phones = await tx.phoneNumber.findMany({
        where: { lineId, tenantId, deletedAt: null },
        select: { id: true },
      });
      const phoneIds = phones.map((p) => p.id);

      if (phoneIds.length) {
        await tx.numberAssignment.updateMany({
          where: { phoneNumberId: { in: phoneIds }, effectiveTo: null, deletedAt: null },
          data: { effectiveTo: now, updatedBy: userId },
        });
        await tx.inboundRoute.updateMany({
          where: {
            tenantId,
            deletedAt: null,
            OR: [
              { phoneNumberId: { in: phoneIds } },
              { destinationExtensionId: existing.id },
              { destinationLineId: lineId },
            ],
          },
          data: { deletedAt: now, updatedBy: userId, enabled: false },
        });
        await tx.phoneNumber.updateMany({
          where: { id: { in: phoneIds }, tenantId },
          data: { lineId: null, updatedBy: userId },
        });
      } else {
        await tx.inboundRoute.updateMany({
          where: {
            tenantId,
            deletedAt: null,
            OR: [{ destinationExtensionId: existing.id }, { destinationLineId: lineId }],
          },
          data: { deletedAt: now, updatedBy: userId, enabled: false },
        });
      }

      await tx.presence.updateMany({
        where: { lineId, tenantId, deletedAt: null },
        data: { deviceId: null, updatedBy: userId },
      });

      const devices = await tx.device.findMany({
        where: { lineId, tenantId, deletedAt: null },
        select: { id: true, sipEndpointId: true },
      });
      const sipIds = devices.map((d) => d.sipEndpointId).filter((x): x is string => Boolean(x));

      if (devices.length) {
        await tx.device.updateMany({
          where: { lineId, tenantId, deletedAt: null },
          data: { deletedAt: now, deletedBy: userId, sipEndpointId: null, lineId: null },
        });
      }
      if (sipIds.length) {
        await tx.sIPEndpoint.updateMany({
          where: { id: { in: sipIds }, tenantId, deletedAt: null },
          data: { deletedAt: now, deletedBy: userId },
        });
      }

      await tx.voicemail.updateMany({
        where: { lineId, tenantId, deletedAt: null },
        data: { deletedAt: now, deletedBy: userId, lineId: null },
      });
      await tx.callerID.updateMany({
        where: { lineId, tenantId, deletedAt: null },
        data: { deletedAt: now, deletedBy: userId, phoneNumberId: null },
      });
      await tx.callPolicy.updateMany({
        where: { lineId, tenantId, deletedAt: null },
        data: { deletedAt: now, deletedBy: userId },
      });
      await tx.recordingPolicy.updateMany({
        where: { lineId, tenantId, deletedAt: null },
        data: { deletedAt: now, deletedBy: userId },
      });
      await tx.lineTelephonySettings.updateMany({
        where: { lineId, tenantId, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.presence.updateMany({
        where: { lineId, tenantId, deletedAt: null },
        data: { deletedAt: now, deletedBy: userId },
      });

      await tx.line.update({
        where: { id: lineId },
        data: { deletedAt: now, deletedBy: userId },
      });

      // Free @@unique([tenantId, extension]) so the number can be reused.
      await tx.extension.update({
        where: { id: existing.id },
        data: {
          extension: tombstoneExtensionNumber(existing.extension, existing.id),
          deletedAt: now,
          deletedBy: userId,
        },
      });
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.extension.delete',
      entityType: 'Extension',
      entityId: id,
      metadata: { extension: existing.extension, lineId, cleaned: true },
    });

    return { ok: true };
  }

  async bulkImport(tenantId: string, userId: string, dto: BulkImportExtensionsDto) {
    const results: { extension: string; ok: boolean; error?: string }[] = [];

    for (const row of dto.rows) {
      try {
        await this.create(tenantId, userId, {
          userId: row.userId,
          extension: row.extension,
          lineName: row.lineName,
          callerIdName: row.callerIdName,
        });
        results.push({ extension: row.extension, ok: true });
      } catch (e) {
        results.push({
          extension: row.extension,
          ok: false,
          error: e instanceof Error ? e.message : 'Failed',
        });
      }
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.extension.bulk_import',
      entityType: 'Extension',
      entityId: tenantId,
      metadata: { count: dto.rows.length, success: results.filter((r) => r.ok).length },
    });

    return { results };
  }

  async exportCsvAsync(tenantId: string): Promise<string> {
    const rows = await this.list(tenantId);
    const header = 'extension,userId,userEmail,lineName,callerIdName,presence,forwardEnabled,forwardDestination,dnd';
    const lines = rows.map((r) => {
      const line = r.line;
      const user = line.user;
      const email = user?.email ?? '';
      const settings = line.telephonySettings;
      return [
        r.extension,
        line.userId ?? '',
        email,
        line.name,
        line.callerId?.callerIdName ?? '',
        line.presence?.status ?? '',
        settings?.callForwardEnabled ? 'true' : 'false',
        settings?.callForwardDestination ?? '',
        settings?.dndEnabled ? 'true' : 'false',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    return [header, ...lines].join('\n');
  }

  async mobileQr(tenantId: string, actorUserId: string, id: string) {
    const extension = await this.prisma.extension.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: {
        line: {
          include: {
            tenant: true,
            devices: {
              where: {
                deletedAt: null,
                deviceType: { in: [DeviceType.MOBILE, DeviceType.WEBRTC] },
              },
              include: { sipEndpoint: true },
              orderBy: { updatedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
    if (!extension) throw new NotFoundException('Extension not found');

    let device = extension.line.devices[0] ?? null;
    if (!device?.sipEndpoint) {
      device = await this.ensureMobileDevice(tenantId, actorUserId, extension);
    }
    if (!device?.sipEndpoint) {
      throw new BadRequestException('Unable to provision mobile device for extension');
    }

    const enroll = await this.issueEnrollToken(
      { sub: actorUserId, tenantId, email: '' },
      device.id,
    );

    const deepLink = `vspphone://enroll?token=${encodeURIComponent(enroll.token)}&extension=${encodeURIComponent(extension.extension)}&tenantSlug=${encodeURIComponent(extension.line.tenant.slug)}`;
    const qrDataUrl = await QRCode.toDataURL(deepLink, { margin: 1, width: 320 });

    return {
      extensionId: extension.id,
      extension: extension.extension,
      displayName: extension.line.name,
      label: formatExtensionLabel(extension.extension, extension.line.name),
      deviceId: device.id,
      deepLink,
      qrDataUrl,
      expiresAt: enroll.expiresAt,
      expiresInMinutes: Math.round(this.enrollTtlSec / 60),
      enroll,
      supports: {
        webrtc: true,
        nativeApp: true,
      },
    };
  }

  async unassignDid(tenantId: string, actorUserId: string, id: string) {
    const extension = await this.require(tenantId, id);
    const phone = await this.prisma.phoneNumber.findFirst({
      where: { lineId: extension.lineId, tenantId, deletedAt: null },
    });
    if (!phone) throw new NotFoundException('No DID assigned to this extension');

    await this.prisma.$transaction(async (tx) => {
      await tx.phoneNumber.update({
        where: { id: phone.id },
        data: { lineId: null, updatedBy: actorUserId },
      });
      await tx.inboundRoute.updateMany({
        where: { tenantId, phoneNumberId: phone.id, deletedAt: null },
        data: { enabled: false, updatedBy: actorUserId },
      });
      await tx.callerID.updateMany({
        where: { tenantId, lineId: extension.lineId, phoneNumberId: phone.id },
        data: { phoneNumberId: null, updatedBy: actorUserId },
      });
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId,
      action: 'pbx.extension.did_unassign',
      entityType: 'Extension',
      entityId: id,
      metadata: { phoneNumberId: phone.id, number: phone.number },
    });

    return { ok: true, phoneNumberId: phone.id };
  }

  async restartRegistration(tenantId: string, actorUserId: string, id: string) {
    const extension = await this.prisma.extension.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: {
        line: {
          include: {
            devices: {
              where: { deletedAt: null },
              include: { sipEndpoint: true },
              orderBy: { updatedAt: 'desc' },
            },
          },
        },
      },
    });
    if (!extension) throw new NotFoundException('Extension not found');

    const mobile = extension.line.devices.find(
      (d) => d.deviceType === DeviceType.MOBILE || d.deviceType === DeviceType.WEBRTC,
    );
    if (mobile) {
      return this.mobileQr(tenantId, actorUserId, id);
    }

    const desk = extension.line.devices.find((d) => d.deviceType === DeviceType.DESK_PHONE);
    if (desk?.sipEndpoint) {
      await this.prisma.sIPEndpoint.update({
        where: { id: desk.sipEndpoint.id },
        data: { registrationStatus: SIPEndpointStatus.UNREGISTERED, updatedBy: actorUserId },
      });
      return { ok: true, deviceId: desk.id, action: 'desk_reprovision_pending' };
    }

    return this.mobileQr(tenantId, actorUserId, id);
  }

  private async ensureMobileDevice(
    tenantId: string,
    actorUserId: string,
    extension: {
      extension: string;
      lineId: string;
      line: { userId: string | null; tenant: { slug: string } };
    },
  ) {
    const line = await this.prisma.line.findFirst({
      where: { id: extension.lineId, tenantId, deletedAt: null },
      include: { extension: true, tenant: true },
    });
    if (!line?.extension) throw new NotFoundException('Line not found');

    const existingMobile = await this.prisma.device.findFirst({
      where: {
        lineId: line.id,
        tenantId,
        deletedAt: null,
        deviceType: DeviceType.MOBILE,
      },
      include: { sipEndpoint: true },
    });
    if (existingMobile?.sipEndpoint) {
      return existingMobile;
    }

    const deviceId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      const endpoint = await this.lineSip.resolveOrCreateForLine(
        { tenantId, lineId: line.id, actorUserId },
        tx,
      );
      await tx.device.create({
        data: {
          id: deviceId,
          publicId: newPublicId('dev'),
          tenantId,
          lineId: line.id,
          userId: line.userId,
          sipEndpointId: endpoint.id,
          name: `Mobile — ${line.name}`,
          deviceType: DeviceType.MOBILE,
          createdBy: actorUserId,
        },
      });
      if (line.userId) {
        await tx.deviceAssignment.create({
          data: {
            id: randomUUID(),
            tenantId,
            deviceId,
            userId: line.userId,
            lineId: line.id,
            effectiveFrom: new Date(),
            createdBy: actorUserId,
          },
        });
      }
    });

    return this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
      include: { sipEndpoint: true },
    });
  }

  private async issueEnrollToken(user: JwtPayload, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        tenantId: user.tenantId,
        deletedAt: null,
        deviceType: { in: [DeviceType.MOBILE, DeviceType.WEBRTC] },
      },
      include: { sipEndpoint: true, tenant: true },
    });
    if (!device?.sipEndpoint) throw new NotFoundException('Mobile device not found');

    const realm = `${device.tenant.slug}.sip.${this.platformDomain}`;
    const sipPassword = randomBytes(18).toString('base64url');
    const version = `enroll-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + this.enrollTtlSec * 1000).toISOString();

    this.vault.registerEnrollCredential({
      sipEndpointId: device.sipEndpoint.id,
      authUsername: device.sipEndpoint.authUsername,
      realm,
      password: sipPassword,
      ttlSec: this.enrollTtlSec,
      version,
    });

    const tokenPayload = {
      deviceId: device.id,
      sipEndpointId: device.sipEndpoint.id,
      tenantId: user.tenantId,
      version,
      expiresAt,
    };

    await this.redis.setex(
      this.redis.webrtcEnrollKey(user.tenantId, device.sipEndpoint.id),
      this.enrollTtlSec,
      JSON.stringify({ ...tokenPayload, userId: user.sub }),
    );

    return {
      token: Buffer.from(JSON.stringify(tokenPayload)).toString('base64url'),
      sipUsername: device.sipEndpoint.authUsername,
      sipPassword,
      aor: device.sipEndpoint.aor,
      realm,
      expiresAt,
      enrollTtlSec: this.enrollTtlSec,
      deviceId: device.id,
      sipEndpointId: device.sipEndpoint.id,
    };
  }

  private async loadLastCallMap(tenantId: string, lineIds: string[]) {
    const map = new Map<string, Date>();
    if (!lineIds.length) return map;

    const sessions = await this.prisma.callSession.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ fromLineId: { in: lineIds } }, { toLineId: { in: lineIds } }],
      },
      select: { fromLineId: true, toLineId: true, startedAt: true, endedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    for (const session of sessions) {
      const at = session.startedAt ?? session.endedAt ?? session.createdAt;
      for (const lineId of [session.fromLineId, session.toLineId]) {
        if (!lineId || !lineIds.includes(lineId)) continue;
        const prev = map.get(lineId);
        if (!prev || at > prev) map.set(lineId, at);
      }
    }

    return map;
  }

  private toHubRow(
    row: Prisma.ExtensionGetPayload<{ include: typeof extensionInclude }>,
    lastCallAt: Date | null,
  ): ExtensionHubRow {
    const line = row.line;
    const devices = line.devices;
    const hasMobileApp = devices.some(
      (d) => d.deviceType === DeviceType.MOBILE || d.deviceType === DeviceType.WEBRTC,
    );
    const hasDeskPhone = devices.some((d) => d.deviceType === DeviceType.DESK_PHONE);
    const primary =
      devices.find((d) => d.deviceType === DeviceType.DESK_PHONE) ??
      devices.find((d) => d.deviceType === DeviceType.MOBILE || d.deviceType === DeviceType.WEBRTC) ??
      devices[0] ??
      null;
    const did = line.phoneNumbers[0] ?? line.callerId?.phoneNumber ?? null;
    const user = line.user;
    const profile = user?.profile;

    const resolved = this.resolveHubStatus(devices, line.presence?.status);
    let { status, statusLabel, registrationLabel, onlineStatus } = resolved;

    const linkedUser = user
      ? {
          id: user.id,
          email: user.email,
          displayName:
            profile?.displayName ??
            (profile?.firstName
              ? `${profile.firstName} ${profile.lastName ?? ''}`.trim()
              : null),
        }
      : null;

    const needsSetup = extensionNeedsBusinessSetup({
      extension: row.extension,
      displayName: line.name,
      hasLinkedUser: Boolean(linkedUser),
      status,
    });
    if (needsSetup) {
      statusLabel = 'Needs Setup';
    }

    const deviceLabel = primary
      ? [primary.manufacturer, primary.model].filter(Boolean).join(' ').trim() || primary.name
      : '';

    const lastCallIso = lastCallAt ? lastCallAt.toISOString() : null;
    const lastRegAt =
      primary?.sipEndpoint?.lastRegisteredAt ?? primary?.lastSeenAt ?? primary?.updatedAt ?? null;
    const provisionLabel =
      status === 'Registered' || status === 'Provisioned'
        ? 'Configured'
        : status === 'RegistrationFailed'
          ? 'Failed'
          : 'Pending';
    const recordingEnabled = Boolean(line.recordingPolicy?.recordingEnabled);
    const voicemailEnabled = line.voicemail?.status === 'ACTIVE';

    return {
      id: row.id,
      lineId: row.lineId,
      extension: row.extension,
      displayName: line.name,
      label: formatExtensionLabel(row.extension, line.name),
      description: row.description,
      department: row.department ? { id: row.department.id, name: row.department.name } : null,
      did: did
        ? {
            id: did.id,
            number: did.number,
            formatted: this.formatPhoneDisplay(did.number),
          }
        : null,
      device: primary
        ? {
            id: primary.id,
            name: primary.name,
            deviceType: primary.deviceType,
            manufacturer: primary.manufacturer,
            model: primary.model,
            registrationStatus: primary.sipEndpoint?.registrationStatus ?? 'UNREGISTERED',
            deviceLabel,
          }
        : null,
      hasMobileApp,
      hasDeskPhone,
      status,
      statusLabel,
      onlineStatus,
      registrationLabel,
      lastCallAt: lastCallIso,
      lastCallRelative: formatRelativeTime(lastCallIso),
      lastRegistrationAt: lastRegAt ? new Date(lastRegAt).toISOString() : null,
      provisionLabel,
      recordingEnabled,
      voicemailEnabled,
      linkedUser,
    };
  }

  private resolveHubStatus(
    devices: Array<{
      deviceType: DeviceType;
      status: DeviceStatus;
      provisioningStatus: ProvisioningStatus;
      sipEndpoint?: { registrationStatus: SIPEndpointStatus } | null;
    }>,
    presence?: PresenceStatus | null,
  ): {
    status: ExtensionHubStatus;
    statusLabel: string;
    registrationLabel: string;
    onlineStatus: 'Online' | 'Offline';
  } {
    if (!devices.length) {
      return {
        status: 'NoDevice',
        statusLabel: 'No Device',
        registrationLabel: 'No device assigned',
        onlineStatus: 'Offline',
      };
    }

    const anyRegistered = devices.some((d) => d.sipEndpoint?.registrationStatus === SIPEndpointStatus.REGISTERED);
    if (anyRegistered) {
      return {
        status: 'Registered',
        statusLabel: 'Registered',
        registrationLabel: 'Registered',
        onlineStatus: 'Online',
      };
    }

    const anyFailed = devices.some(
      (d) =>
        d.provisioningStatus === ProvisioningStatus.FAILED ||
        d.status === DeviceStatus.INACTIVE,
    );
    if (anyFailed) {
      return {
        status: 'RegistrationFailed',
        statusLabel: 'Registration Failed',
        registrationLabel: 'Registration failed',
        onlineStatus: 'Offline',
      };
    }

    const anyProvisioned = devices.some(
      (d) =>
        d.sipEndpoint &&
        (d.provisioningStatus === ProvisioningStatus.PROVISIONED ||
          d.provisioningStatus === ProvisioningStatus.PROVISIONING ||
          d.status === DeviceStatus.PROVISIONING),
    );
    if (anyProvisioned || devices.some((d) => d.sipEndpoint)) {
      return {
        status: 'Provisioned',
        statusLabel: 'Provisioned',
        registrationLabel: 'Waiting for first login',
        onlineStatus: 'Offline',
      };
    }

    return {
      status: 'NoDevice',
      statusLabel: 'No Device',
      registrationLabel: 'No device assigned',
      onlineStatus: 'Offline',
    };
  }

  private formatPhoneDisplay(number: string): string {
    const digits = number.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return number;
  }

  private async require(tenantId: string, id: string) {
    const row = await this.prisma.extension.findFirst({
      where: { id, ...tenantScope(tenantId) },
    });
    if (!row) throw new NotFoundException('Extension not found');
    return row;
  }
}

export type { CreateExtensionDto, UpdateExtensionDto, BulkImportExtensionsDto, RenameExtensionDisplayNameDto };
