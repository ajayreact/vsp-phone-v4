import { Injectable, Logger } from '@nestjs/common';
import {
  DeviceStatus,
  ProvisioningStatus,
  SIPEndpointStatus,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { ProvisioningRedisService } from '../redis/provisioning-redis.service';
import { macAlreadyExistsConflict } from '../utils/mac-conflict.util';
import { normalizeMac, ProvisioningVaultService } from '../vault/provisioning-vault.service';

export type DeviceCleanupRow = {
  id: string;
  tenantId: string;
  macAddress: string | null;
  sipEndpointId: string | null;
  lineId?: string | null;
};

type Tx = Prisma.TransactionClient;

/**
 * Centralized release of desk-phone provisioning state (Redis, vault, SIP cache, DB fields).
 * Used by tenant delete / clear / portal reset — not business-rule changes elsewhere.
 */
@Injectable()
export class DeviceProvisioningCleanupService {
  private readonly logger = new Logger(DeviceProvisioningCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: ProvisioningRedisService,
    private readonly vault: ProvisioningVaultService,
  ) {}

  /** Remove Redis MAC index, quarantine, device meta/history, pending commands. */
  async purgeRedisForDevice(tenantId: string, deviceId: string, macRaw: string | null): Promise<void> {
    await this.redis.del(this.redis.deviceMetaKey(tenantId, deviceId));
    await this.redis.del(this.redis.artifactHistoryKey(tenantId, deviceId));

    const mac = macRaw ? normalizeMac(String(macRaw)) : '';
    if (mac.length === 12) {
      await this.redis.del(this.redis.macIndexKey(mac));
      await this.redis.del(this.redis.quarantineKey(mac));
    }
  }

  /** Revoke in-memory prov HTTP, admin, and optionally shared desk SIP credentials. */
  revokeVaultSecrets(
    deviceId: string,
    macRaw: string | null,
    sipEndpointId: string | null,
    revokeSharedSip: boolean,
  ): void {
    if (macRaw) {
      this.vault.revokeProvHttp(macRaw);
    }
    this.vault.revokeAdminPassword(deviceId);
    if (revokeSharedSip && sipEndpointId) {
      this.vault.revokeDeskSip(sipEndpointId);
    }
  }

  /** Clear SIP registration when no active sibling devices share the endpoint. */
  async clearSipRegistrationIfOrphan(
    tenantId: string,
    sipEndpointId: string | null,
    excludeDeviceId: string,
    actorUserId: string,
    tx?: Tx,
  ): Promise<boolean> {
    if (!sipEndpointId) return false;
    const db = tx ?? this.prisma;
    const siblings = await db.device.count({
      where: { sipEndpointId, tenantId, deletedAt: null, id: { not: excludeDeviceId } },
    });
    if (siblings > 0) return false;

    await db.sIPEndpoint.updateMany({
      where: { id: sipEndpointId, tenantId, deletedAt: null },
      data: {
        registrationStatus: SIPEndpointStatus.UNREGISTERED,
        lastRegisteredAt: null,
        updatedBy: actorUserId,
      },
    });
    return true;
  }

  /**
   * Release every active device in a tenant via releaseForDelete (canonical delete path).
   */
  async releaseAllActiveDevices(tenantId: string, actorUserId: string): Promise<number> {
    const devices = await this.prisma.device.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, macAddress: true, sipEndpointId: true },
    });

    for (const device of devices) {
      await this.releaseForDelete(tenantId, actorUserId, {
        id: device.id,
        tenantId,
        macAddress: device.macAddress ? String(device.macAddress) : null,
        sipEndpointId: device.sipEndpointId,
      });
    }

    return devices.length;
  }

  /**
   * Release all active devices on a line; returns SIP endpoint ids that were linked (for extension teardown).
   */
  async releaseDevicesOnLine(
    tenantId: string,
    lineId: string,
    actorUserId: string,
  ): Promise<{ deviceIds: string[]; sipEndpointIds: string[] }> {
    const devices = await this.prisma.device.findMany({
      where: { tenantId, lineId, deletedAt: null },
      select: { id: true, macAddress: true, sipEndpointId: true },
    });

    const sipEndpointIds = new Set<string>();
    for (const device of devices) {
      if (device.sipEndpointId) sipEndpointIds.add(device.sipEndpointId);
      await this.releaseForDelete(tenantId, actorUserId, {
        id: device.id,
        tenantId,
        macAddress: device.macAddress ? String(device.macAddress) : null,
        sipEndpointId: device.sipEndpointId,
      });
    }

    return {
      deviceIds: devices.map((d) => d.id),
      sipEndpointIds: [...sipEndpointIds],
    };
  }

  /**
   * Full release for delete: end assignments, soft-delete, null MAC/line, purge Redis/vault.
   */
  async releaseForDelete(
    tenantId: string,
    actorUserId: string,
    device: DeviceCleanupRow,
  ): Promise<{ macCleared: boolean; sipCleared: boolean }> {
    const mac = device.macAddress ? normalizeMac(String(device.macAddress)) : '';

    await this.prisma.$transaction(async (tx) => {
      await tx.deviceAssignment.updateMany({
        where: { deviceId: device.id, tenantId, effectiveTo: null, deletedAt: null },
        data: { effectiveTo: new Date(), updatedBy: actorUserId },
      });
      await tx.device.update({
        where: { id: device.id },
        data: {
          deletedAt: new Date(),
          deletedBy: actorUserId,
          macAddress: null,
          lineId: null,
          userId: null,
          sipEndpointId: null,
          status: DeviceStatus.INACTIVE,
          provisioningStatus: ProvisioningStatus.FAILED,
          discoveryStatus: null,
          lastProvisionedAt: null,
          firmwareVersion: null,
          updatedBy: actorUserId,
        },
      });
    });

    const sipCleared = await this.clearSipRegistrationIfOrphan(
      tenantId,
      device.sipEndpointId,
      device.id,
      actorUserId,
    );

    await this.purgeRedisForDevice(tenantId, device.id, mac || null);
    this.revokeVaultSecrets(device.id, mac || null, device.sipEndpointId, sipCleared);

    this.logger.log(
      JSON.stringify({
        event: 'provisioning.device.released',
        tenantId,
        deviceId: device.id,
        macCleared: mac.length === 12,
        sipCleared,
      }),
    );

    return { macCleared: mac.length === 12, sipCleared };
  }

  /**
   * Clear MAC + provisioning on an active device record (keep line/extension assignment).
   */
  async clearDeviceProvisioning(
    tenantId: string,
    actorUserId: string,
    device: DeviceCleanupRow,
  ): Promise<{ macCleared: boolean }> {
    const mac = device.macAddress ? normalizeMac(String(device.macAddress)) : '';

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        macAddress: null,
        provisioningStatus: ProvisioningStatus.PENDING,
        discoveryStatus: null,
        lastProvisionedAt: null,
        firmwareVersion: null,
        status: DeviceStatus.PROVISIONING,
        updatedBy: actorUserId,
      },
    });

    const sipCleared = await this.clearSipRegistrationIfOrphan(
      tenantId,
      device.sipEndpointId,
      device.id,
      actorUserId,
    );

    await this.purgeRedisForDevice(tenantId, device.id, mac || null);
    this.revokeVaultSecrets(device.id, mac || null, device.sipEndpointId, sipCleared);

    return { macCleared: mac.length === 12 };
  }

  /**
   * Reset provisioning while keeping MAC, line, and extension binding.
   */
  async resetDeviceProvisioningState(
    tenantId: string,
    actorUserId: string,
    device: DeviceCleanupRow,
  ): Promise<void> {
    if (!device.macAddress) return;

    const mac = normalizeMac(String(device.macAddress));
    await this.purgeRedisForDevice(tenantId, device.id, mac);

    this.vault.revokeProvHttp(mac);
    this.vault.issueProvHttp(mac);
    this.vault.revokeAdminPassword(device.id);
    this.vault.issueAdminPassword(device.id);

    if (device.sipEndpointId) {
      await this.prisma.sIPEndpoint.updateMany({
        where: { id: device.sipEndpointId, tenantId, deletedAt: null },
        data: {
          registrationStatus: SIPEndpointStatus.UNREGISTERED,
          lastRegisteredAt: null,
          updatedBy: actorUserId,
        },
      });
    }

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        provisioningStatus: ProvisioningStatus.PROVISIONING,
        discoveryStatus: null,
        lastProvisionedAt: null,
        status: DeviceStatus.PROVISIONING,
        updatedBy: actorUserId,
      },
    });
  }

  /** Sweep all tenant provisioning Redis keys (meta/history); MAC keys for listed devices. */
  async purgeTenantProvisioningRedis(tenantId: string, macs: string[]): Promise<number> {
    let deleted = await this.redis.deleteByPrefix(`vsp:${tenantId}:prov:`);
    for (const macRaw of macs) {
      const mac = normalizeMac(macRaw);
      if (mac.length === 12) {
        await this.redis.del(this.redis.macIndexKey(mac));
        await this.redis.del(this.redis.quarantineKey(mac));
        deleted += 2;
      }
    }
    return deleted;
  }

  /**
   * Clear MAC binding on a device row that is no longer active (soft-deleted or being retired).
   * Does not change deleted_at — only releases MAC inventory + prov sidecars.
   */
  async releaseMacBinding(
    tenantId: string,
    device: DeviceCleanupRow,
    actorUserId?: string,
  ): Promise<boolean> {
    const mac = device.macAddress ? normalizeMac(String(device.macAddress)) : '';
    if (mac.length !== 12) return false;

    await this.prisma.device.updateMany({
      where: { id: device.id, tenantId, macAddress: mac },
      data: {
        macAddress: null,
        status: DeviceStatus.INACTIVE,
        provisioningStatus: ProvisioningStatus.FAILED,
        ...(actorUserId ? { updatedBy: actorUserId } : {}),
      },
    });

    await this.purgeRedisForDevice(tenantId, device.id, mac);
    this.revokeVaultSecrets(device.id, mac, device.sipEndpointId, false);

    this.logger.log(
      JSON.stringify({
        event: 'provisioning.mac.released',
        tenantId,
        deviceId: device.id,
        mac,
        reason: 'soft_deleted_orphan',
      }),
    );

    return true;
  }

  /**
   * One-time / startup repair for devices soft-deleted before MAC release was enforced.
   */
  async repairSoftDeletedDeviceMacBindings(): Promise<number> {
    const rows = await this.prisma.device.findMany({
      where: { deletedAt: { not: null }, macAddress: { not: null } },
      select: {
        id: true,
        tenantId: true,
        macAddress: true,
        sipEndpointId: true,
        deletedAt: true,
        status: true,
        line: { select: { extension: { select: { extension: true } } } },
      },
    });

    let repaired = 0;
    for (const row of rows) {
      const released = await this.releaseMacBinding(row.tenantId, {
        id: row.id,
        tenantId: row.tenantId,
        macAddress: row.macAddress ? String(row.macAddress) : null,
        sipEndpointId: row.sipEndpointId,
      });
      if (released) {
        repaired += 1;
        this.logger.warn(
          JSON.stringify({
            event: 'provisioning.mac.legacy_repair',
            table: 'devices',
            deviceId: row.id,
            tenantId: row.tenantId,
            extension: row.line?.extension?.extension ?? null,
            deletedAt: row.deletedAt?.toISOString() ?? null,
            status: row.status,
            mac: row.macAddress,
          }),
        );
      }
    }

    if (repaired > 0) {
      this.logger.log(
        JSON.stringify({ event: 'provisioning.mac.legacy_repair_complete', repaired }),
      );
    }

    return repaired;
  }

  /** Assert MAC is not held by any active device row; heal orphaned soft-deleted bindings. */
  async assertMacAvailable(macRaw: string, excludeDeviceId?: string): Promise<void> {
    const mac = normalizeMac(macRaw);
    const indexed = await this.redis.get(this.redis.macIndexKey(mac));
    if (indexed) {
      let parsed: { deviceId?: string } = {};
      try {
        parsed = JSON.parse(indexed) as { deviceId?: string };
      } catch {
        await this.redis.del(this.redis.macIndexKey(mac));
      }

      if (parsed.deviceId && (!excludeDeviceId || parsed.deviceId !== excludeDeviceId)) {
        const owner = await this.prisma.device.findFirst({
          where: { id: parsed.deviceId, macAddress: mac },
          select: {
            id: true,
            tenantId: true,
            deletedAt: true,
            macAddress: true,
            sipEndpointId: true,
          },
        });
        if (owner?.deletedAt) {
          await this.releaseMacBinding(owner.tenantId, {
            id: owner.id,
            tenantId: owner.tenantId,
            macAddress: owner.macAddress ? String(owner.macAddress) : null,
            sipEndpointId: owner.sipEndpointId,
          });
        } else if (owner) {
          macAlreadyExistsConflict();
        }
      }
      await this.redis.del(this.redis.macIndexKey(mac));
    }

    const existing = await this.prisma.device.findFirst({
      where: {
        macAddress: mac,
        ...(excludeDeviceId ? { id: { not: excludeDeviceId } } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        deletedAt: true,
        macAddress: true,
        sipEndpointId: true,
        status: true,
        line: { select: { extension: { select: { extension: true } } } },
      },
    });
    if (!existing) return;

    if (existing.deletedAt) {
      await this.releaseMacBinding(existing.tenantId, {
        id: existing.id,
        tenantId: existing.tenantId,
        macAddress: existing.macAddress ? String(existing.macAddress) : null,
        sipEndpointId: existing.sipEndpointId,
      });
      return;
    }

    macAlreadyExistsConflict();
  }

  /**
   * Tenant-scoped portal reset: remove all devices and provisioning state.
   * Preserves users, extensions, DIDs, voicemail, and tenant settings.
   */
  async resetTenantPortal(tenantId: string, actorUserId: string): Promise<{
    devicesRemoved: number;
    redisKeysDeleted: number;
    macsCleared: number;
  }> {
    const macs = new Set<string>();
    const macRows = await this.prisma.device.findMany({
      where: { tenantId, macAddress: { not: null } },
      select: { macAddress: true },
    });
    for (const row of macRows) {
      if (row.macAddress) macs.add(normalizeMac(String(row.macAddress)));
    }

    const devicesRemoved = await this.releaseAllActiveDevices(tenantId, actorUserId);

    await this.prisma.device.updateMany({
      where: { tenantId, deletedAt: { not: null }, macAddress: { not: null } },
      data: {
        macAddress: null,
        status: DeviceStatus.INACTIVE,
        provisioningStatus: ProvisioningStatus.FAILED,
        updatedBy: actorUserId,
      },
    });

    await this.prisma.sIPEndpoint.updateMany({
      where: {
        tenantId,
        deletedAt: null,
        devices: { none: { tenantId, deletedAt: null } },
      },
      data: {
        registrationStatus: SIPEndpointStatus.UNREGISTERED,
        lastRegisteredAt: null,
        updatedBy: actorUserId,
      },
    });

    let redisKeysDeleted = await this.purgeTenantProvisioningRedis(tenantId, [...macs]);
    for (const mac of macs) {
      this.vault.revokeProvHttp(mac);
    }

    this.logger.log(
      JSON.stringify({
        event: 'provisioning.tenant_portal_reset',
        tenantId,
        devicesRemoved,
        macsCleared: macs.size,
        redisKeysDeleted,
      }),
    );

    return {
      devicesRemoved,
      redisKeysDeleted,
      macsCleared: macs.size,
    };
  }
}
