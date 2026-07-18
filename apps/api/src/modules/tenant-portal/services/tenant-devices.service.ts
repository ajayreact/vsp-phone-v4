import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DeviceManufacturer,
  DeviceStatus,
  DeviceType,
  ProvisioningStatus,
  SIPEndpointStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { JwtPayload } from '../../auth/jwt.util';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { DeviceEnrollmentService } from '../../provisioning/enrollment/device-enrollment.service';
import { ProvisioningRedisService } from '../../provisioning/redis/provisioning-redis.service';
import { buildProvConfigUrl } from '../../provisioning/url/prov-config-url';
import { normalizeMac } from '../../provisioning/vault/provisioning-vault.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type {
  AssignDeviceDto,
  BulkAssignDevicesDto,
  BulkImportDevicesDto,
  CloneDeviceDto,
  CreateDeviceDto,
  MoveDeviceSiteDto,
  UpdateDeviceDto,
} from '../dto/tenant-devices.dto';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { tenantScope } from '../utils/tenant.util';

const deviceInclude = {
  line: {
    select: {
      id: true,
      name: true,
      extension: { select: { id: true, extension: true } },
      user: {
        select: {
          id: true,
          email: true,
          profile: { select: { firstName: true, lastName: true, displayName: true } },
        },
      },
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      profile: { select: { firstName: true, lastName: true, displayName: true } },
    },
  },
  site: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true } },
  sipEndpoint: {
    select: {
      id: true,
      registrationStatus: true,
      lastRegisteredAt: true,
      aor: true,
    },
  },
  provisioningTemplate: { select: { id: true, name: true, manufacturer: true, templateKind: true } },
  tenant: { select: { id: true, name: true, displayName: true, slug: true } },
} as const;

@Injectable()
export class TenantDevicesService {
  private readonly logger = new Logger(TenantDevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
    private readonly enrollment: DeviceEnrollmentService,
    private readonly redis: ProvisioningRedisService,
  ) {}

  async list(tenantId: string, search?: string) {
    if (!this.prisma.connected) return [];

    const where: Record<string, unknown> = tenantScope(tenantId);
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { macAddress: { contains: search.trim(), mode: 'insensitive' } },
        { model: { contains: search.trim(), mode: 'insensitive' } },
        { serialNumber: { contains: search.trim(), mode: 'insensitive' } },
        { assetTag: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.device.findMany({
      where,
      include: deviceInclude,
      orderBy: { name: 'asc' },
      take: 1000,
    });

    return Promise.all(rows.map((row) => this.enrichDevice(tenantId, row)));
  }

  async getById(tenantId: string, id: string) {
    const row = await this.require(tenantId, id);
    return this.enrichDevice(tenantId, row);
  }

  async create(tenantId: string, userId: string, dto: CreateDeviceDto) {
    this.logger.log(
      JSON.stringify({
        event: 'tenant.device.create.service',
        tenantId,
        actorUserId: userId,
        lineId: dto.lineId ?? null,
        deviceType: dto.deviceType,
        name: dto.name,
        manufacturer: dto.manufacturer ?? null,
        macPresent: Boolean(dto.macAddress),
        path:
          dto.deviceType === DeviceType.DESK_PHONE && dto.lineId && dto.macAddress
            ? 'enroll'
            : 'inventory',
      }),
    );

    try {
      if (dto.deviceType === DeviceType.DESK_PHONE && dto.lineId && dto.macAddress) {
        const user: JwtPayload = { sub: userId, tenantId, email: '', portal: 'tenant' };
        this.logger.log(
          JSON.stringify({
            event: 'tenant.device.create.before_enroll',
            tenantId,
            lineId: dto.lineId,
            manufacturer: dto.manufacturer ?? null,
          }),
        );
        const enrolled = await this.enrollment.enroll(user, {
          mac: dto.macAddress,
          name: dto.name,
          lineId: dto.lineId,
          manufacturer: dto.manufacturer,
          model: dto.model,
          modelFamily: dto.modelFamily,
          siteId: dto.siteId,
          departmentId: dto.departmentId,
          provisioningTemplateId: dto.provisioningTemplateId,
          firmwareChannel: dto.firmwareChannel,
          serialNumber: dto.serialNumber,
          assetTag: dto.assetTag,
          location: dto.location,
          transport: dto.transport,
          tlsEnabled: dto.tlsEnabled,
          srtpEnabled: dto.srtpEnabled,
        });
        const device = await this.getById(tenantId, enrolled.deviceId);
        await auditPbxMutation(this.audit, {
          tenantId,
          actorUserId: userId,
          action: 'pbx.device.create.enroll',
          entityType: 'Device',
          entityId: enrolled.deviceId,
          metadata: { mac: enrolled.mac, lineId: dto.lineId },
        });
        return device;
      }

      const id = randomUUID();
      const publicId = `dev_${id.replace(/-/g, '').slice(0, 16)}`;
      const mac = dto.macAddress ? normalizeMac(dto.macAddress) : null;

      if (mac) {
        const dup = await this.prisma.device.findFirst({
          where: { macAddress: mac, deletedAt: null },
        });
        if (dup) throw new BadRequestException('MAC address already in use');
      }

      this.logger.log(
        JSON.stringify({
          event: 'tenant.device.create.before_db',
          tenantId,
          actorUserId: userId,
          deviceId: id,
          lineId: dto.lineId ?? null,
          deviceType: dto.deviceType,
          macAddress: mac,
        }),
      );

      const device = await this.prisma.device.create({
        data: {
          id,
          publicId,
          tenantId,
          name: dto.name,
          deviceType: dto.deviceType,
          manufacturer: dto.manufacturer ?? this.inferManufacturer(dto.model, dto.modelFamily),
          model: dto.model,
          macAddress: mac,
          lineId: dto.lineId,
          siteId: dto.siteId,
          departmentId: dto.departmentId,
          provisioningTemplateId: dto.provisioningTemplateId,
          serialNumber: dto.serialNumber,
          assetTag: dto.assetTag,
          location: dto.location,
          firmwareChannel: dto.firmwareChannel,
          transport: dto.transport ?? 'UDP',
          tlsEnabled: dto.tlsEnabled ?? false,
          srtpEnabled: dto.srtpEnabled ?? false,
          status: DeviceStatus.PROVISIONING,
          provisioningStatus: ProvisioningStatus.PENDING,
          createdBy: userId,
        },
        include: deviceInclude,
      });

      await auditPbxMutation(this.audit, {
        tenantId,
        actorUserId: userId,
        action: 'pbx.device.create',
        entityType: 'Device',
        entityId: device.id,
        metadata: { name: dto.name, deviceType: dto.deviceType },
      });

      return this.enrichDevice(tenantId, device);
    } catch (err) {
      this.logger.error(
        JSON.stringify({
          event: 'tenant.device.create.service_error',
          tenantId,
          actorUserId: userId,
          lineId: dto.lineId ?? null,
          deviceType: dto.deviceType,
          errName: err instanceof Error ? err.name : 'Unknown',
          errMsg: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack?.split('\n').slice(0, 8) : undefined,
        }),
      );
      throw err;
    }
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateDeviceDto) {
    await this.require(tenantId, id);

    const device = await this.prisma.device.update({
      where: { id },
      data: {
        name: dto.name,
        manufacturer: dto.manufacturer,
        model: dto.model,
        siteId: dto.siteId,
        departmentId: dto.departmentId,
        provisioningTemplateId: dto.provisioningTemplateId,
        serialNumber: dto.serialNumber,
        assetTag: dto.assetTag,
        location: dto.location,
        firmwareVersion: dto.firmwareVersion,
        transport: dto.transport,
        tlsEnabled: dto.tlsEnabled,
        srtpEnabled: dto.srtpEnabled,
        updatedBy: userId,
      },
      include: deviceInclude,
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.device.update',
      entityType: 'Device',
      entityId: id,
      metadata: dto as Record<string, unknown>,
    });

    return this.enrichDevice(tenantId, device);
  }

  async assign(tenantId: string, userId: string, id: string, dto: AssignDeviceDto) {
    const user: JwtPayload = { sub: userId, tenantId, email: '', portal: 'tenant' };
    await this.enrollment.assignLine(user, id, dto.lineId);
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.device.assign',
      entityType: 'Device',
      entityId: id,
      metadata: { lineId: dto.lineId },
    });
    return this.getById(tenantId, id);
  }

  async unassign(tenantId: string, userId: string, id: string) {
    await this.require(tenantId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.deviceAssignment.updateMany({
        where: { deviceId: id, tenantId, effectiveTo: null, deletedAt: null },
        data: { effectiveTo: new Date(), updatedBy: userId },
      });
      await tx.device.update({
        where: { id },
        data: { lineId: null, userId: null, updatedBy: userId },
      });
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.device.unassign',
      entityType: 'Device',
      entityId: id,
    });

    return this.getById(tenantId, id);
  }

  async deactivate(tenantId: string, userId: string, id: string) {
    await this.require(tenantId, id);
    const device = await this.prisma.device.update({
      where: { id },
      data: { status: DeviceStatus.INACTIVE, updatedBy: userId },
      include: deviceInclude,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.device.deactivate',
      entityType: 'Device',
      entityId: id,
    });
    return this.enrichDevice(tenantId, device);
  }

  async activate(tenantId: string, userId: string, id: string) {
    await this.require(tenantId, id);
    const device = await this.prisma.device.update({
      where: { id },
      data: { status: DeviceStatus.PROVISIONING, updatedBy: userId },
      include: deviceInclude,
    });
    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.device.activate',
      entityType: 'Device',
      entityId: id,
    });
    return this.enrichDevice(tenantId, device);
  }

  /** Marks this device as the primary device for its line; clears isPrimary on siblings. */
  async makePrimary(tenantId: string, userId: string, id: string) {
    const existing = await this.require(tenantId, id);
    if (!existing.lineId) {
      throw new BadRequestException('Device is not assigned to an extension');
    }
    if (existing.isPrimary) {
      return this.enrichDevice(tenantId, existing);
    }

    const device = await this.prisma.$transaction(async (tx) => {
      await tx.device.updateMany({
        where: { tenantId, lineId: existing.lineId, deletedAt: null, isPrimary: true },
        data: { isPrimary: false, updatedBy: userId },
      });
      return tx.device.update({
        where: { id },
        data: { isPrimary: true, updatedBy: userId },
        include: deviceInclude,
      });
    });

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.device.make_primary',
      entityType: 'Device',
      entityId: id,
      metadata: { lineId: existing.lineId },
    });

    return this.enrichDevice(tenantId, device);
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.require(tenantId, id);
    const mac = existing.macAddress ? normalizeMac(String(existing.macAddress)) : '';
    const sipEndpointId = existing.sipEndpointId ?? null;

    // Soft-delete, clear MAC / tokens / registration so the same MAC can re-enroll immediately.
    await this.prisma.$transaction(async (tx) => {
      await tx.deviceAssignment.updateMany({
        where: { deviceId: id, tenantId, effectiveTo: null, deletedAt: null },
        data: { effectiveTo: new Date(), updatedBy: userId },
      });
      await tx.device.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy: userId,
          macAddress: null,
          lineId: null,
          userId: null,
          sipEndpointId: null,
          status: DeviceStatus.INACTIVE,
          provisioningStatus: ProvisioningStatus.FAILED,
          discoveryStatus: null,
          updatedBy: userId,
        },
      });

      if (sipEndpointId) {
        const siblings = await tx.device.count({
          where: { sipEndpointId, tenantId, deletedAt: null, id: { not: id } },
        });
        if (siblings === 0) {
          await tx.sIPEndpoint.updateMany({
            where: { id: sipEndpointId, tenantId, deletedAt: null },
            data: {
              registrationStatus: SIPEndpointStatus.UNREGISTERED,
              lastRegisteredAt: null,
              updatedBy: userId,
            },
          });
        }
      }
    });

    if (mac.length === 12) {
      await this.redis.del(this.redis.macIndexKey(mac));
      await this.redis.del(this.redis.quarantineKey(mac));
    }
    await this.redis.del(this.redis.deviceMetaKey(tenantId, id));
    await this.redis.del(this.redis.artifactHistoryKey(tenantId, id));

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.device.delete',
      entityType: 'Device',
      entityId: id,
      metadata: {
        macCleared: Boolean(mac),
        previousMac: mac || null,
        sipEndpointCleared: Boolean(sipEndpointId),
      },
    });
    return { ok: true, macCleared: Boolean(mac) };
  }

  async clone(tenantId: string, userId: string, id: string, dto: CloneDeviceDto) {
    const source = await this.require(tenantId, id);
    return this.create(tenantId, userId, {
      name: dto.name,
      deviceType: source.deviceType,
      manufacturer: source.manufacturer ?? undefined,
      model: source.model ?? undefined,
      macAddress: dto.macAddress,
      lineId: source.lineId ?? undefined,
      siteId: source.siteId ?? undefined,
      departmentId: source.departmentId ?? undefined,
      provisioningTemplateId: source.provisioningTemplateId ?? undefined,
      serialNumber: undefined,
      assetTag: undefined,
      location: source.location ?? undefined,
      firmwareChannel: (source.firmwareChannel as 'stable' | 'n-1' | 'emergency') ?? undefined,
      transport: source.transport ?? undefined,
      tlsEnabled: source.tlsEnabled,
      srtpEnabled: source.srtpEnabled,
    });
  }

  async moveSite(tenantId: string, userId: string, id: string, dto: MoveDeviceSiteDto) {
    const site = await this.prisma.site.findFirst({
      where: { id: dto.siteId, tenantId, deletedAt: null },
    });
    if (!site) throw new NotFoundException('Site not found');

    const device = await this.prisma.device.update({
      where: { id },
      data: { siteId: dto.siteId, updatedBy: userId },
      include: deviceInclude,
    });

    const metaKey = this.redis.deviceMetaKey(tenantId, id);
    await this.redis.hset(metaKey, 'siteId', dto.siteId);

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.device.move_site',
      entityType: 'Device',
      entityId: id,
      metadata: { siteId: dto.siteId },
    });

    return this.enrichDevice(tenantId, device);
  }

  async bulkImport(tenantId: string, userId: string, dto: BulkImportDevicesDto) {
    const results: { name: string; ok: boolean; id?: string; error?: string }[] = [];

    for (const row of dto.rows) {
      try {
        let lineId: string | undefined;
        if (row.extension) {
          const ext = await this.prisma.extension.findFirst({
            where: { tenantId, extension: row.extension, deletedAt: null },
          });
          if (!ext) throw new BadRequestException(`Extension ${row.extension} not found`);
          lineId = ext.lineId;
        }

        const device = await this.create(tenantId, userId, {
          name: row.name,
          deviceType: row.deviceType,
          manufacturer: row.manufacturer,
          model: row.model,
          macAddress: row.macAddress,
          lineId,
          serialNumber: row.serialNumber,
          assetTag: row.assetTag,
          location: row.location,
        });
        results.push({ name: row.name, ok: true, id: String((device as Record<string, unknown>).id) });
      } catch (err) {
        results.push({
          name: row.name,
          ok: false,
          error: err instanceof Error ? err.message : 'Import failed',
        });
      }
    }

    await auditPbxMutation(this.audit, {
      tenantId,
      actorUserId: userId,
      action: 'pbx.device.bulk_import',
      entityType: 'Device',
      entityId: tenantId,
      metadata: { count: dto.rows.length, success: results.filter((r) => r.ok).length },
    });

    return { results };
  }

  async bulkAssign(tenantId: string, userId: string, dto: BulkAssignDevicesDto) {
    const results: { deviceId: string; ok: boolean; error?: string }[] = [];
    for (const deviceId of dto.deviceIds) {
      try {
        await this.assign(tenantId, userId, deviceId, { lineId: dto.lineId });
        results.push({ deviceId, ok: true });
      } catch (err) {
        results.push({
          deviceId,
          ok: false,
          error: err instanceof Error ? err.message : 'Assign failed',
        });
      }
    }
    return { results };
  }

  async bulkDelete(tenantId: string, userId: string, deviceIds: string[]) {
    const results: { deviceId: string; ok: boolean; error?: string }[] = [];
    for (const deviceId of deviceIds) {
      try {
        await this.remove(tenantId, userId, deviceId);
        results.push({ deviceId, ok: true });
      } catch (err) {
        results.push({
          deviceId,
          ok: false,
          error: err instanceof Error ? err.message : 'Delete failed',
        });
      }
    }
    return { results };
  }

  async exportCsv(tenantId: string): Promise<string> {
    const rows = await this.list(tenantId);
    const header =
      'id,name,deviceType,manufacturer,model,macAddress,extension,userEmail,site,department,status,provisioningStatus,registrationStatus,ipAddress,firmwareVersion,serialNumber,assetTag,location,lastSeenAt';
    const lines = rows.map((r) => {
      const row = r as Record<string, unknown>;
      const ext = (row.line as { extension?: { extension?: string } })?.extension?.extension ?? '';
      const userEmail = (row.user as { email?: string })?.email ?? '';
      const siteName = (row.site as { name?: string })?.name ?? '';
      const deptName = (row.department as { name?: string })?.name ?? '';
      const reg = (row.sipEndpoint as { registrationStatus?: string })?.registrationStatus ?? '';
      const prov = row.provisioningMeta as { ipAddress?: string } | undefined;
      return [
        row.id,
        csvEscape(String(row.name)),
        row.deviceType,
        row.manufacturer ?? '',
        row.model ?? '',
        row.macAddress ?? '',
        ext,
        csvEscape(userEmail),
        csvEscape(siteName),
        csvEscape(deptName),
        row.status,
        row.provisioningStatus,
        reg,
        prov?.ipAddress ?? row.ipAddress ?? '',
        row.firmwareVersion ?? '',
        row.serialNumber ?? '',
        row.assetTag ?? '',
        csvEscape(String(row.location ?? '')),
        row.lastSeenAt ? new Date(String(row.lastSeenAt)).toISOString() : '',
      ].join(',');
    });
    return [header, ...lines].join('\n');
  }

  private async require(tenantId: string, id: string) {
    const row = await this.prisma.device.findFirst({
      where: { id, ...tenantScope(tenantId) },
      include: deviceInclude,
    });
    if (!row) throw new NotFoundException('Device not found');
    return row;
  }

  private async enrichDevice(tenantId: string, row: Record<string, unknown>) {
    const deviceId = String(row.id);
    const meta = await this.redis.hgetall(this.redis.deviceMetaKey(tenantId, deviceId));
    const history = await this.redis.lrange(this.redis.artifactHistoryKey(tenantId, deviceId), 0, 19);
    const configHistory = history.map((h) => {
      try {
        return JSON.parse(h) as Record<string, unknown>;
      } catch {
        return { raw: h };
      }
    });

    return {
      ...row,
      provisioningMeta: {
        configVersion: meta.configVersion ? Number(meta.configVersion) : null,
        artifactHash: meta.artifactHash ?? null,
        templateVersion: meta.templateVersion ?? null,
        modelFamily: meta.modelFamily ?? null,
        firmwareChannel: meta.firmwareChannel ?? null,
        pendingCommand: meta.pendingCommand ?? null,
        lastStatus: meta.lastStatus ?? null,
        lastStatusAt: meta.lastStatusAt ?? null,
        ipAddress: meta.lastSeenIp ?? row.ipAddress ?? null,
        latencyMs: meta.latencyMs ? Number(meta.latencyMs) : null,
        packetLoss: meta.packetLoss ? Number(meta.packetLoss) : null,
        jitterMs: meta.jitterMs ? Number(meta.jitterMs) : null,
        mos: meta.mos ? Number(meta.mos) : null,
      },
      configHistory,
      provUrl: buildProvConfigUrl(
        String(row.manufacturer ?? 'GRANDSTREAM'),
        row.macAddress ? String(row.macAddress) : null,
      ),
    };
  }

  private inferManufacturer(model?: string, modelFamily?: string): DeviceManufacturer | undefined {
    const hint = `${model ?? ''} ${modelFamily ?? ''}`.toLowerCase();
    if (/grp|gxp|ht8|wp8/.test(hint)) return DeviceManufacturer.GRANDSTREAM;
    if (/t[2345]|cp9|w5/.test(hint)) return DeviceManufacturer.YEALINK;
    if (/x[0-9]|fanvil/.test(hint)) return DeviceManufacturer.FANVIL;
    if (/vvx|poly|soundstation/.test(hint)) return DeviceManufacturer.POLY;
    if (/cp-|spa|cisco/.test(hint)) return DeviceManufacturer.CISCO;
    if (/snom|d7|d3/.test(hint)) return DeviceManufacturer.SNOM;
    return undefined;
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
