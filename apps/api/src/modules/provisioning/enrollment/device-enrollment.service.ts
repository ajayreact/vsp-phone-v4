import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeviceStatus,
  DeviceType,
  SIPEndpointStatus,
  TenantStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { JwtPayload } from '../../auth/jwt.util';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { ProvisioningAuditService } from '../audit/provisioning-audit.service';
import type { FirmwareChannel } from '../firmware/firmware-catalog.service';
import { ConfigGeneratorService } from '../generator/config-generator.service';
import { ProvisioningRedisService } from '../redis/provisioning-redis.service';
import { isValidMac, normalizeMac, ProvisioningVaultService } from '../vault/provisioning-vault.service';

export interface EnrollDeskPhoneInput {
  mac: string;
  name: string;
  lineId: string;
  modelFamily?: string;
  siteId?: string;
  firmwareChannel?: FirmwareChannel;
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
    private readonly config: ConfigService,
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

    await this.assertGlobalMacAvailable(mac);

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
    const sipEndpointId = randomUUID();
    const assignmentId = randomUUID();
    const publicDeviceId = `dev_${deviceId.replace(/-/g, '').slice(0, 16)}`;
    const publicSipId = `sip_${sipEndpointId.replace(/-/g, '').slice(0, 16)}`;
    const realm = `${line.tenant.slug}.sip.${this.platformDomain}`;
    const aor = `sip:${line.extension.extension}@${realm}`;
    const authUsername = line.extension.extension;
    const modelFamily = (input.modelFamily ?? 'grp261x').toLowerCase();
    const firmwareChannel = input.firmwareChannel ?? 'stable';

    const deskSecret = this.vault.issueDeskSip({
      sipEndpointId,
      authUsername,
      realm,
    });
    const provHttp = this.vault.issueProvHttp(mac);
    this.vault.issueAdminPassword(deviceId);

    await this.prisma.$transaction(async (tx) => {
      await tx.sIPEndpoint.create({
        data: {
          id: sipEndpointId,
          publicId: publicSipId,
          tenantId: user.tenantId,
          aor,
          authUsername,
          registrationStatus: SIPEndpointStatus.UNREGISTERED,
          createdBy: user.sub,
        },
      });
      await tx.device.create({
        data: {
          id: deviceId,
          publicId: publicDeviceId,
          tenantId: user.tenantId,
          lineId: line.id,
          userId: line.userId,
          sipEndpointId,
          name: input.name,
          deviceType: DeviceType.DESK_PHONE,
          status: DeviceStatus.PROVISIONING,
          macAddress: mac,
          createdBy: user.sub,
        },
      });
      await tx.deviceAssignment.create({
        data: {
          id: assignmentId,
          tenantId: user.tenantId,
          deviceId,
          userId: line.userId,
          lineId: line.id,
          effectiveFrom: new Date(),
          createdBy: user.sub,
        },
      });
    });

    const timezone = line.tenant.settings?.timezone ?? 'America/New_York';
    const language = line.tenant.settings?.defaultLanguage ?? 'en';
    const configVersion = 1;

    const rendered = await this.generator.generate({
      tenantId: user.tenantId,
      deviceId,
      mac,
      deviceName: input.name,
      modelFamily,
      sipEndpointId,
      authUsername,
      aor,
      displayName: line.user.username ?? line.user.email ?? line.name,
      realm,
      configVersion,
      firmwareChannel,
      timezone,
      language,
      siteCode: input.siteId,
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
      deskSecretVersion: deskSecret.version,
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
      await tx.deviceAssignment.updateMany({
        where: { deviceId, tenantId: user.tenantId, effectiveTo: null, deletedAt: null },
        data: { effectiveTo: new Date(), updatedBy: user.sub },
      });
      await tx.deviceAssignment.create({
        data: {
          id: randomUUID(),
          tenantId: user.tenantId,
          deviceId,
          userId: line.userId,
          lineId: line.id,
          effectiveFrom: new Date(),
          createdBy: user.sub,
        },
      });
      await tx.device.update({
        where: { id: deviceId },
        data: { lineId: line.id, userId: line.userId, updatedBy: user.sub },
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

  private async assertGlobalMacAvailable(mac: string): Promise<void> {
    const indexed = await this.redis.get(this.redis.macIndexKey(mac));
    if (indexed) {
      throw new ConflictException('MAC already enrolled');
    }
    const existing = await this.prisma.device.findFirst({
      where: { macAddress: mac, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('MAC already enrolled');
    }
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
}
