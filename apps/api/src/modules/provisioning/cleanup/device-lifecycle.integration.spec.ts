/**
 * Device lifecycle integration — canonical cleanup path must release MAC for re-enroll.
 */
import { ConflictException } from '@nestjs/common';
import { DeviceStatus, ProvisioningStatus } from '@prisma/client';
import { DeviceProvisioningCleanupService } from './device-provisioning-cleanup.service';
import { macAlreadyExistsConflict } from '../utils/mac-conflict.util';

type DeviceRow = {
  id: string;
  tenantId: string;
  lineId: string | null;
  macAddress: string | null;
  sipEndpointId: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  status: DeviceStatus;
  provisioningStatus: ProvisioningStatus;
};

describe('device lifecycle integration (MAC re-enroll)', () => {
  const tenantId = 'tenant-1';
  const actorUserId = 'user-1';
  const lineId = 'line-1';
  const mac = 'ec74d751e3e7';
  const deviceId = 'device-1';
  const sipEndpointId = 'sip-1';

  function buildHarness(initial: DeviceRow[]) {
    const devices = new Map<string, DeviceRow>(initial.map((d) => [d.id, { ...d }]));
    const redis = new Map<string, string>();
    const vaultRevoked = { macs: [] as string[], devices: [] as string[] };

    const redisSvc = {
      del: jest.fn(async (key: string) => {
        redis.delete(key);
      }),
      get: jest.fn(async (key: string) => redis.get(key) ?? null),
      set: jest.fn(async (key: string, val: string) => {
        redis.set(key, val);
      }),
      deviceMetaKey: (t: string, d: string) => `vsp:${t}:prov:device:${d}:meta`,
      artifactHistoryKey: (t: string, d: string) => `vsp:${t}:prov:device:${d}:history`,
      macIndexKey: (m: string) => `vsp:prov:mac:${m}`,
      quarantineKey: (m: string) => `vsp:prov:quarantine:${m}`,
      deleteByPrefix: jest.fn(async () => 0),
    };

    const vault = {
      revokeProvHttp: jest.fn(async (m: string) => {
        vaultRevoked.macs.push(m);
      }),
      revokeAdminPassword: jest.fn((id: string) => {
        vaultRevoked.devices.push(id);
      }),
      revokeDeskSip: jest.fn(),
    };

    const prisma = {
      device: {
        findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          return [...devices.values()].filter((d) => {
            if (where.tenantId && d.tenantId !== where.tenantId) return false;
            if (where.lineId && d.lineId !== where.lineId) return false;
            if (where.deletedAt === null && d.deletedAt !== null) return false;
            if (
              where.deletedAt &&
              typeof where.deletedAt === 'object' &&
              where.deletedAt !== null &&
              'not' in where.deletedAt
            ) {
              const notVal = (where.deletedAt as { not: unknown }).not;
              if (notVal === null && d.deletedAt === null) return false;
            }
            if (where.macAddress === null && d.macAddress !== null) return false;
            if (
              where.macAddress &&
              typeof where.macAddress === 'object' &&
              where.macAddress !== null &&
              'not' in where.macAddress &&
              (where.macAddress as { not: unknown }).not === null &&
              d.macAddress === null
            ) {
              return false;
            }
            if (typeof where.macAddress === 'string' && d.macAddress !== where.macAddress) {
              return false;
            }
            return true;
          });
        }),
        findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const rows = await prisma.device.findMany({ where });
          if (where.id && typeof where.id === 'string') {
            return rows.find((r) => r.id === where.id) ?? null;
          }
          if (where.macAddress && typeof where.macAddress === 'string') {
            return rows.find((r) => r.macAddress === where.macAddress) ?? null;
          }
          return rows[0] ?? null;
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<DeviceRow> }) => {
          const row = devices.get(where.id);
          if (!row) throw new Error('not found');
          Object.assign(row, data);
          return row;
        }),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: Record<string, unknown>;
            data: Partial<DeviceRow>;
          }) => {
            let count = 0;
            for (const row of devices.values()) {
              if (where.id && row.id !== where.id) continue;
              if (where.tenantId && row.tenantId !== where.tenantId) continue;
              if (where.macAddress && row.macAddress !== where.macAddress) continue;
              Object.assign(row, data);
              count += 1;
            }
            return { count };
          },
        ),
        count: jest.fn(async () => 0),
      },
      deviceAssignment: {
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      sIPEndpoint: {
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };

    const cleanup = new DeviceProvisioningCleanupService(
      prisma as never,
      redisSvc as never,
      vault as never,
    );

    return { cleanup, devices, redis, vaultRevoked, redisSvc, prisma };
  }

  function activeDevice(overrides?: Partial<DeviceRow>): DeviceRow {
    return {
      id: deviceId,
      tenantId,
      lineId,
      macAddress: mac,
      sipEndpointId,
      deletedAt: null,
      deletedBy: null,
      status: DeviceStatus.PROVISIONING,
      provisioningStatus: ProvisioningStatus.PROVISIONING,
      ...overrides,
    };
  }

  async function expectMacAvailable(cleanup: DeviceProvisioningCleanupService): Promise<void> {
    await expect(cleanup.assertMacAvailable(mac)).resolves.toBeUndefined();
  }

  it('extension delete (releaseDevicesOnLine) then re-enroll same MAC succeeds', async () => {
    const { cleanup, devices, redis, vaultRevoked } = buildHarness([activeDevice()]);
    redis.set(`vsp:prov:mac:${mac}`, JSON.stringify({ tenantId, deviceId }));

    await cleanup.releaseDevicesOnLine(tenantId, lineId, actorUserId);

    const row = devices.get(deviceId)!;
    expect(row.deletedAt).toBeTruthy();
    expect(row.macAddress).toBeNull();
    expect(redis.has(`vsp:prov:mac:${mac}`)).toBe(false);
    expect(vaultRevoked.macs).toContain(mac);

    await expectMacAvailable(cleanup);
  });

  it('device delete (releaseForDelete) then re-enroll same MAC succeeds', async () => {
    const { cleanup, devices } = buildHarness([activeDevice()]);

    await cleanup.releaseForDelete(tenantId, actorUserId, {
      id: deviceId,
      tenantId,
      macAddress: mac,
      sipEndpointId,
    });

    expect(devices.get(deviceId)!.macAddress).toBeNull();
    await expectMacAvailable(cleanup);
  });

  it('portal reset then re-enroll same MAC succeeds', async () => {
    const { cleanup, devices } = buildHarness([activeDevice()]);

    await cleanup.resetTenantPortal(tenantId, actorUserId);

    expect(devices.get(deviceId)!.macAddress).toBeNull();
    await expectMacAvailable(cleanup);
  });

  it('legacy soft-deleted row with MAC auto-heals on enroll assert', async () => {
    const { cleanup, devices, redis, vaultRevoked } = buildHarness([
      activeDevice({
        deletedAt: new Date('2026-07-01T00:00:00.000Z'),
        deletedBy: actorUserId,
        status: DeviceStatus.INACTIVE,
        provisioningStatus: ProvisioningStatus.FAILED,
      }),
    ]);
    redis.set(`vsp:prov:mac:${mac}`, JSON.stringify({ tenantId, deviceId }));

    await expectMacAvailable(cleanup);

    expect(devices.get(deviceId)!.macAddress).toBeNull();
    expect(redis.has(`vsp:prov:mac:${mac}`)).toBe(false);
    expect(vaultRevoked.macs).toContain(mac);
  });

  it('active duplicate MAC still returns conflict', async () => {
    const { cleanup } = buildHarness([activeDevice()]);

    await expect(cleanup.assertMacAvailable(mac)).rejects.toBeInstanceOf(ConflictException);
    await expect(async () => macAlreadyExistsConflict()).rejects.toBeInstanceOf(ConflictException);
  });
});
