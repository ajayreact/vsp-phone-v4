import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeviceStatus,
  DeviceType,
  ProvisioningStatus,
  TenantStatus,
  type DeviceManufacturer,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { JwtPayload } from '../../auth/jwt.util';
import { LineSipEndpointService } from '../../tenant-portal/services/line-sip-endpoint.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { ProvisioningAuditService } from '../audit/provisioning-audit.service';
import type { FirmwareChannel } from '../firmware/firmware-catalog.service';
import { ConfigGeneratorService } from '../generator/config-generator.service';
import { ProvisioningRedisService } from '../redis/provisioning-redis.service';
import { DeviceProvisioningCleanupService } from '../cleanup/device-provisioning-cleanup.service';
import { throwMacConflictIfPrisma } from '../utils/mac-conflict.util';
import { isValidMac, normalizeMac, ProvisioningVaultService } from '../vault/provisioning-vault.service';

export interface EnrollDeskPhoneInput {
  mac: string;
  name: string;
  lineId: string;
  manufacturer?: DeviceManufacturer;
  model?: string;
  modelFamily?: string;
  siteId?: string;
  departmentId?: string;
  provisioningTemplateId?: string;
  firmwareChannel?: FirmwareChannel;
  serialNumber?: string;
  assetTag?: string;
  location?: string;
  transport?: string;
  tlsEnabled?: boolean;
  srtpEnabled?: boolean;
}

export interface EnrollDeskPhoneResult {
  deviceId: string;
  mac: string;
  provUrl: string;
  configVersion: number;
  artifactHash: string;
  provHttpUsername: string;
  status: DeviceStatus;
}

/** Phase 11 — admin device enrollment + MAC inventory (TEL-PROV-001). */
@Injectable()
export class DeviceEnrollmentService {
  private readonly platformDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: ProvisioningRedisService,
    private readonly vault: ProvisioningVaultService,
    private readonly generator: ConfigGeneratorService,
    private readonly audit: ProvisioningAuditService,
    private readonly lineSip: LineSipEndpointService,
    private readonly config: ConfigService,
    private readonly provisioningCleanup: DeviceProvisioningCleanupService,
  ) {
    this.platformDomain = config.get<string>('SIP_PLATFORM_DOMAIN', 'vsp.internal');
  }

  async enroll(user: JwtPayload, input: EnrollDeskPhoneInput): Promise<EnrollDeskPhoneResult> {
    if (!this.prisma.connected) {
      throw new BadRequestException('Database unavailable');
    }
    const mac = normalizeMac(input.mac);
    if (!isValidMac(mac)) {
      throw new BadRequestException('Invalid MAC address');
    }

    await this.provisioningCleanup.assertMacAvailable(mac);

    const line = await this.prisma.line.findFirst({
      where: { id: input.lineId, tenantId: user.tenantId, deletedAt: null },
      include: { extension: true, user: true, tenant: { include: { settings: true } } },
    });
    if (!line?.extension) {
      throw new NotFoundException('Line with extension required');
    }
    if (line.tenant.status !== TenantStatus.ACTIVE && line.tenant.status !== TenantStatus.PENDING) {
      throw new BadRequestException('Tenant inactive');
    }

    const deviceId = randomUUID();
    const assignmentId = randomUUID();
    const publicDeviceId = `dev_${deviceId.replace(/-/g, '').slice(0, 16)}`;
    const realm = `${line.tenant.slug}.sip.${this.platformDomain}`;
    const modelFamily = (input.modelFamily ?? this.defaultModelFamily(input.manufacturer)).toLowerCase();
    const firmwareChannel = input.firmwareChannel ?? 'stable';
    const manufacturer = input.manufacturer ?? this.inferManufacturer(modelFamily);

    if (input.provisioningTemplateId) {
      const template = await this.prisma.provisioningTemplate.findFirst({
        where: { id: input.provisioningTemplateId, tenantId: user.tenantId, deletedAt: null },
      });
      if (!template) throw new NotFoundException('Provisioning template not found');
    }

    const endpoint = await this.prisma.$transaction(async (tx) => {
      const sipEndpoint = await this.lineSip.resolveOrCreateForLine(
        { tenantId: user.tenantId, lineId: line.id, actorUserId: user.sub },
        tx,
      );

      await tx.device.create({
        data: {
          id: deviceId,
          publicId: publicDeviceId,
          tenantId: user.tenantId,
          lineId: line.id,
          userId: line.userId,
          sipEndpointId: sipEndpoint.id,
          name: input.name,
          deviceType: DeviceType.DESK_PHONE,
          status: DeviceStatus.PROVISIONING,
          macAddress: mac,
          manufacturer,
          model: input.model,
          siteId: input.siteId,
          departmentId: input.departmentId,
          provisioningTemplateId: input.provisioningTemplateId,
          serialNumber: input.serialNumber,
          assetTag: input.assetTag,
          location: input.location,
          firmwareChannel,
          transport: input.transport ?? 'UDP',
          tlsEnabled: input.tlsEnabled ?? false,
          srtpEnabled: input.srtpEnabled ?? false,
          provisioningStatus: ProvisioningStatus.PROVISIONING,
          createdBy: user.sub,
        },
      });

      const assignmentUserId = line.userId ?? user.sub;
      const assignmentUser = await tx.user.findFirst({
        where: { id: assignmentUserId, tenantId: user.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (assignmentUser) {
        await tx.deviceAssignment.create({
          data: {
            id: assignmentId,
            tenantId: user.tenantId,
            deviceId,
            userId: assignmentUser.id,
            lineId: line.id,
            effectiveFrom: new Date(),
            createdBy: user.sub,
          },
        });
      }

      return sipEndpoint;
    }).catch((err) => {
      throwMacConflictIfPrisma(err);
    });

    const sipEndpointId = endpoint.id;
    const authUsername = endpoint.authUsername;
    const aor = endpoint.aor;
    // Do not rotate shared endpoint password when attaching another device.
    let deskSecretVersion = 'shared';
    if (!(await this.vault.resolveDeskSipPassword(sipEndpointId))) {
      deskSecretVersion = this.vault.issueDeskSip({ sipEndpointId, authUsername, realm }).version;
    }
    const provHttp = (await this.vault.resolveProvHttp(mac)) ?? (await this.vault.issueProvHttp(mac));
    this.vault.issueAdminPassword(deviceId);

    const timezone = line.tenant.settings?.timezone ?? 'America/New_York';
    const language = line.tenant.settings?.defaultLanguage ?? 'en';
    const configVersion = 1;

    const rendered = await this.generator.generate({
      tenantId: user.tenantId,
      deviceId,
      mac,
      deviceName: input.name,
      modelFamily,
      manufacturer,
      sipEndpointId,
      authUsername,
      aor,
      displayName: line.user?.username ?? line.user?.email ?? line.name,
      realm,
      configVersion,
      firmwareChannel,
      timezone,
      language,
      siteCode: input.siteId,
    });

    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        provisioningStatus: ProvisioningStatus.PROVISIONED,
        lastProvisionedAt: new Date(),
        firmwareVersion: rendered.firmwareVersion,
      },
    });

    await this.persistDeviceMeta(user.tenantId, deviceId, {
      mac,
      tenantId: user.tenantId,
      lineId: line.id,
      siteId: input.siteId ?? '',
      modelFamily,
      firmwareChannel,
      configVersion: String(configVersion),
      artifactHash: rendered.artifactHash,
      objectKey: rendered.objectKey,
      templateVersion: rendered.templateVersion,
      sipEndpointId,
      deskSecretVersion,
      provHttpVersion: provHttp.version,
    });

    await this.redis.set(this.redis.macIndexKey(mac), JSON.stringify({ tenantId: user.tenantId, deviceId }));

    await this.audit.log('provisioning.enrolled', {
      tenantId: user.tenantId,
      deviceId,
      mac,
      lineId: line.id,
      userId: user.sub,
      configVersion,
      artifactHash: rendered.artifactHash,
    });

    return {
      deviceId,
      mac,
      provUrl: rendered.provUrl,
      configVersion,
      artifactHash: rendered.artifactHash,
      provHttpUsername: provHttp.username,
      status: DeviceStatus.PROVISIONING,
    };
  }

  async assignLine(
    user: JwtPayload,
    deviceId: string,
    lineId: string,
  ): Promise<{ deviceId: string; lineId: string }> {
    const device = await this.requireTenantDevice(user.tenantId, deviceId);
    const line = await this.prisma.line.findFirst({
      where: { id: lineId, tenantId: user.tenantId, deletedAt: null },
      include: { user: true },
    });
    if (!line) throw new NotFoundException('Line not found');

    await this.prisma.$transaction(async (tx) => {
      const endpoint = await this.lineSip.resolveOrCreateForLine(
        { tenantId: user.tenantId, lineId: line.id, actorUserId: user.sub },
        tx,
      );
      await tx.deviceAssignment.updateMany({
        where: { deviceId, tenantId: user.tenantId, effectiveTo: null, deletedAt: null },
        data: { effectiveTo: new Date(), updatedBy: user.sub },
      });
      const assignmentUser = line.userId
        ? await tx.user.findFirst({
            where: { id: line.userId, tenantId: user.tenantId, deletedAt: null },
            select: { id: true },
          })
        : null;
      if (assignmentUser) {
        await tx.deviceAssignment.create({
          data: {
            id: randomUUID(),
            tenantId: user.tenantId,
            deviceId,
            userId: assignmentUser.id,
            lineId: line.id,
            effectiveFrom: new Date(),
            createdBy: user.sub,
          },
        });
      }
      await tx.device.update({
        where: { id: deviceId },
        data: {
          lineId: line.id,
          userId: line.userId,
          sipEndpointId: endpoint.id,
          updatedBy: user.sub,
        },
      });
    });

    await this.audit.log('provisioning.assigned', {
      tenantId: user.tenantId,
      deviceId,
      lineId,
      userId: user.sub,
    });

    return { deviceId, lineId };
  }


  private async requireTenantDevice(tenantId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId, deletedAt: null, deviceType: DeviceType.DESK_PHONE },
      include: { sipEndpoint: true },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  private async persistDeviceMeta(
    tenantId: string,
    deviceId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const key = this.redis.deviceMetaKey(tenantId, deviceId);
    for (const [field, value] of Object.entries(fields)) {
      await this.redis.hset(key, field, value);
    }
    const history = {
      configVersion: fields.configVersion,
      artifactHash: fields.artifactHash,
      objectKey: fields.objectKey,
      templateVersion: fields.templateVersion,
      ts: new Date().toISOString(),
    };
    await this.redis.lpush(this.redis.artifactHistoryKey(tenantId, deviceId), JSON.stringify(history));
  }

  private defaultModelFamily(manufacturer?: DeviceManufacturer): string {
    switch (manufacturer) {
      case 'YEALINK':
        return 't46u';
      case 'FANVIL':
        return 'x4u';
      case 'POLY':
        return 'vvx450';
      case 'CISCO':
        return 'cp8841';
      case 'SNOM':
        return 'd735';
      default:
        return 'grp261x';
    }
  }

  private inferManufacturer(modelFamily: string): DeviceManufacturer {
    const hint = modelFamily.toLowerCase();
    if (/grp|gxp|ht8|wp8/.test(hint)) return 'GRANDSTREAM';
    if (/t[2345]|cp9|w5/.test(hint)) return 'YEALINK';
    if (/x[0-9]|fanvil/.test(hint)) return 'FANVIL';
    if (/vvx|poly|soundstation/.test(hint)) return 'POLY';
    if (/cp-|spa|cisco/.test(hint)) return 'CISCO';
    if (/snom|d7|d3/.test(hint)) return 'SNOM';
    return 'GRANDSTREAM';
  }
}
