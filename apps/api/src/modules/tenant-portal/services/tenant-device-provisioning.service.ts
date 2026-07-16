import { Injectable, NotFoundException } from '@nestjs/common';
import { DeviceStatus, ProvisioningStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { JwtPayload } from '../../auth/jwt.util';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { DeviceEnrollmentService } from '../../provisioning/enrollment/device-enrollment.service';
import {
  FirmwareCatalogService,
  type FirmwareRelease,
} from '../../provisioning/firmware/firmware-catalog.service';
import { ProvisioningOrchestratorService } from '../../provisioning/orchestrator/provisioning-orchestrator.service';
import { ProvisioningRedisService } from '../../provisioning/redis/provisioning-redis.service';
import { ArtifactStoreService } from '../../provisioning/store/artifact-store.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  ApproveFirmwareDto,
  EnrollDeviceDto,
  RollbackDeviceConfigDto,
  ScheduleFirmwareRolloutDto,
} from '../dto/tenant-provisioning.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { tenantScope } from '../utils/tenant.util';

@Injectable()
export class TenantDeviceProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
    private readonly enrollment: DeviceEnrollmentService,
    private readonly orchestrator: ProvisioningOrchestratorService,
    private readonly store: ArtifactStoreService,
    private readonly redis: ProvisioningRedisService,
    private readonly firmwareCatalog: FirmwareCatalogService,
  ) {}

  async enroll(tenantId: string, userId: string, dto: EnrollDeviceDto) {
    const user: JwtPayload = { sub: userId, tenantId, email: '', portal: 'tenant' };
    const result = await this.enrollment.enroll(user, dto);

    await this.prisma.device.update({
      where: { id: result.deviceId },
      data: {
        provisioningStatus: ProvisioningStatus.PROVISIONED,
        lastProvisionedAt: new Date(),
        status: DeviceStatus.PROVISIONING,
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.device.enroll',
      entityType: 'Device',
      entityId: result.deviceId,
      metadata: { mac: result.mac, configVersion: result.configVersion },
    });

    return result;
  }

  async reprovision(tenantId: string, userId: string, deviceId: string) {
    await this.requireDevice(tenantId, deviceId);
    const result = await this.orchestrator.reprovision(tenantId, deviceId);

    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        provisioningStatus: ProvisioningStatus.PROVISIONED,
        lastProvisionedAt: new Date(),
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.device.reprovision',
      entityType: 'Device',
      entityId: deviceId,
      metadata: result,
    });

    return result;
  }

  async rollback(tenantId: string, userId: string, dto: RollbackDeviceConfigDto) {
    await this.requireDevice(tenantId, dto.deviceId);
    const result = await this.orchestrator.rollback(tenantId, dto.deviceId, dto.targetConfigVersion);

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.device.config_rollback',
      entityType: 'Device',
      entityId: dto.deviceId,
      metadata: result,
    });

    return result;
  }

  async previewConfig(tenantId: string, deviceId: string) {
    const device = await this.requireDevice(tenantId, deviceId);
    const meta = await this.redis.hgetall(this.redis.deviceMetaKey(tenantId, deviceId));

    if (meta.objectKey) {
      const xml = await this.store.readArtifact(meta.objectKey);
      if (xml) {
        return {
          deviceId,
          configVersion: meta.configVersion ? Number(meta.configVersion) : null,
          artifactHash: meta.artifactHash ?? null,
          contentType: 'application/xml',
          content: xml,
        };
      }
    }

    const rendered = await this.orchestrator.renderDevice(deviceId, tenantId);
    const xml = await this.store.readArtifact(rendered.objectKey);
    return {
      deviceId,
      configVersion: rendered.configVersion,
      artifactHash: rendered.artifactHash,
      contentType: 'application/xml',
      content: xml ?? '',
    };
  }

  async downloadConfig(tenantId: string, deviceId: string) {
    const preview = await this.previewConfig(tenantId, deviceId);
    return preview;
  }

  async configHistory(tenantId: string, deviceId: string) {
    await this.requireDevice(tenantId, deviceId);
    const history = await this.redis.lrange(this.redis.artifactHistoryKey(tenantId, deviceId), 0, 49);
    return history.map((h) => {
      try {
        return JSON.parse(h) as Record<string, unknown>;
      } catch {
        return { raw: h };
      }
    });
  }

  async bulkProvision(tenantId: string, userId: string, deviceIds: string[]) {
    const results: { deviceId: string; ok: boolean; error?: string; configVersion?: number }[] = [];
    for (const deviceId of deviceIds) {
      try {
        const result = await this.reprovision(tenantId, userId, deviceId);
        results.push({ deviceId, ok: true, configVersion: result.configVersion });
      } catch (err) {
        results.push({
          deviceId,
          ok: false,
          error: err instanceof Error ? err.message : 'Provision failed',
        });
      }
    }
    return { results };
  }

  async queueCommand(
    tenantId: string,
    userId: string,
    deviceId: string,
    command: 'reboot' | 'factory_reset',
  ) {
    await this.requireDevice(tenantId, deviceId);
    const metaKey = this.redis.deviceMetaKey(tenantId, deviceId);
    await this.redis.hset(metaKey, 'pendingCommand', command);
    await this.redis.hset(metaKey, 'pendingCommandAt', new Date().toISOString());

    if (command === 'factory_reset') {
      await this.reprovision(tenantId, userId, deviceId);
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: `pbx.device.${command}`,
      entityType: 'Device',
      entityId: deviceId,
    });

    return { deviceId, command, queued: true };
  }

  async bulkCommand(
    tenantId: string,
    userId: string,
    deviceIds: string[],
    command: 'reboot' | 'factory_reset',
  ) {
    const results: { deviceId: string; ok: boolean; error?: string }[] = [];
    for (const deviceId of deviceIds) {
      try {
        await this.queueCommand(tenantId, userId, deviceId, command);
        results.push({ deviceId, ok: true });
      } catch (err) {
        results.push({
          deviceId,
          ok: false,
          error: err instanceof Error ? err.message : 'Command failed',
        });
      }
    }
    return { results };
  }

  async listFirmware(tenantId: string) {
    const catalog = this.getCatalogEntries();
    const dbRows = this.prisma.connected
      ? await this.prisma.firmwareRelease.findMany({
          where: { OR: [{ tenantId }, { tenantId: null }], deletedAt: null },
          orderBy: [{ manufacturer: 'asc' }, { modelFamily: 'asc' }, { version: 'desc' }],
        })
      : [];

    await this.syncCatalogToDb(tenantId, catalog);

    return {
      catalog: catalog.map((c) => ({
        ...c,
        approved: dbRows.some(
          (r) =>
            r.manufacturer === c.manufacturer &&
            r.modelFamily === c.modelFamily &&
            r.version === c.version &&
            r.approved,
        ),
      })),
      releases: dbRows,
    };
  }

  async approveFirmware(tenantId: string, userId: string, dto: ApproveFirmwareDto) {
    const release = await this.prisma.firmwareRelease.findFirst({
      where: {
        id: dto.releaseId,
        deletedAt: null,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });
    if (!release) throw new NotFoundException('Firmware release not found');

    const updated = await this.prisma.firmwareRelease.update({
      where: { id: dto.releaseId },
      data: {
        approved: true,
        approvedAt: new Date(),
        approvedBy: userId,
        rolloutPercent: dto.rolloutPercent ?? release.rolloutPercent,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : release.scheduledAt,
        // Claim shared catalog row for this tenant only when still unscoped.
        tenantId: release.tenantId ?? tenantId,
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.firmware.approve',
      entityType: 'FirmwareRelease',
      entityId: dto.releaseId,
      metadata: { version: updated.version, modelFamily: updated.modelFamily },
    });

    return updated;
  }

  async scheduleRollout(tenantId: string, userId: string, dto: ScheduleFirmwareRolloutDto) {
    const release = await this.prisma.firmwareRelease.findFirst({
      where: {
        id: dto.releaseId,
        deletedAt: null,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });
    if (!release) throw new NotFoundException('Firmware release not found');

    const updated = await this.prisma.firmwareRelease.update({
      where: { id: dto.releaseId },
      data: {
        rolloutPercent: dto.rolloutPercent,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        tenantId: release.tenantId ?? tenantId,
      },
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.firmware.schedule_rollout',
      entityType: 'FirmwareRelease',
      entityId: dto.releaseId,
      metadata: { rolloutPercent: dto.rolloutPercent, scheduledAt: dto.scheduledAt },
    });

    return updated;
  }

  async bulkFirmwareUpdate(tenantId: string, userId: string, deviceIds: string[], releaseId: string) {
    const release = await this.prisma.firmwareRelease.findFirst({
      where: {
        id: releaseId,
        deletedAt: null,
        approved: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });
    if (!release) throw new NotFoundException('Approved firmware release not found');

    const results: { deviceId: string; ok: boolean; error?: string }[] = [];
    for (const deviceId of deviceIds) {
      try {
        const device = await this.requireDevice(tenantId, deviceId);
        await this.prisma.device.update({
          where: { id: deviceId },
          data: {
            firmwareVersion: release.version,
            firmwareChannel: release.channel,
            updatedBy: userId,
          },
        });
        const metaKey = this.redis.deviceMetaKey(tenantId, deviceId);
        await this.redis.hset(metaKey, 'firmwareChannel', release.channel);
        await this.redis.hset(metaKey, 'modelFamily', release.modelFamily);
        await this.reprovision(tenantId, userId, deviceId);
        results.push({ deviceId, ok: true });
      } catch (err) {
        results.push({
          deviceId,
          ok: false,
          error: err instanceof Error ? err.message : 'Firmware update failed',
        });
      }
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.firmware.bulk_update',
      entityType: 'FirmwareRelease',
      entityId: releaseId,
      metadata: { deviceCount: deviceIds.length },
    });

    return { results };
  }

  private async requireDevice(tenantId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, ...tenantScope(tenantId) },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  private getCatalogEntries() {
    const families = ['grp261x', 'gxp21xx', 't46u', 't54w', 'x4u', 'vvx450'];
    const channels: Array<'stable' | 'n-1' | 'emergency'> = ['stable', 'n-1', 'emergency'];
    const entries: Array<FirmwareRelease & { manufacturer: string }> = [];

    for (const family of families) {
      for (const channel of channels) {
        const release = this.firmwareCatalog.resolve(family, channel);
        if (release) {
          entries.push({
            ...release,
            manufacturer: this.manufacturerForFamily(family),
          });
        }
      }
    }
    return entries;
  }

  private manufacturerForFamily(family: string): string {
    if (/grp|gxp/.test(family)) return 'GRANDSTREAM';
    if (/t[0-9]|cp/.test(family)) return 'YEALINK';
    if (/x[0-9]/.test(family)) return 'FANVIL';
    if (/vvx/.test(family)) return 'POLY';
    return 'OTHER';
  }

  private async syncCatalogToDb(tenantId: string, catalog: ReturnType<typeof this.getCatalogEntries>) {
    if (!this.prisma.connected) return;

    for (const entry of catalog) {
      const existing = await this.prisma.firmwareRelease.findFirst({
        where: {
          manufacturer: entry.manufacturer as never,
          modelFamily: entry.modelFamily,
          version: entry.version,
          channel: entry.channel,
          deletedAt: null,
        },
      });
      if (!existing) {
        await this.prisma.firmwareRelease.create({
          data: {
            id: randomUUID(),
            tenantId: null,
            manufacturer: entry.manufacturer as never,
            modelFamily: entry.modelFamily,
            version: entry.version,
            channel: entry.channel,
            downloadUrl: this.firmwareCatalog.firmwareUrl(
              process.env.PROV_PUBLIC_BASE_URL ?? 'https://prov.localhost:3444',
              entry,
            ),
            approved: entry.channel === 'stable',
            approvedAt: entry.channel === 'stable' ? new Date() : null,
          },
        });
      }
    }
  }
}
