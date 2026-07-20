import { DeviceStatus, ProvisioningStatus, SIPEndpointStatus } from '@prisma/client';
import { DeviceProvisioningCleanupService } from './device-provisioning-cleanup.service';

describe('DeviceProvisioningCleanupService', () => {
  const tenantId = 'tenant-1';
  const actorUserId = 'user-1';
  const deviceId = 'device-1';
  const mac = 'ec74d751e3e7';

  function buildService(overrides?: {
    deviceFindFirst?: unknown;
    deviceCount?: number;
    transactionImpl?: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
  }) {
    const redis = {
      del: jest.fn().mockResolvedValue(undefined),
      deviceMetaKey: (t: string, d: string) => `vsp:${t}:prov:device:${d}:meta`,
      artifactHistoryKey: (t: string, d: string) => `vsp:${t}:prov:device:${d}:history`,
      macIndexKey: (m: string) => `vsp:prov:mac:${m}`,
      quarantineKey: (m: string) => `vsp:prov:quarantine:${m}`,
      deleteByPrefix: jest.fn().mockResolvedValue(3),
      get: jest.fn().mockResolvedValue(null),
    };
    const vault = {
      revokeProvHttp: jest.fn(),
      revokeAdminPassword: jest.fn(),
      revokeDeskSip: jest.fn(),
      issueProvHttp: jest.fn().mockReturnValue({ username: mac, password: 'p', version: 'v1' }),
      issueAdminPassword: jest.fn().mockReturnValue('admin-pw'),
    };
    const tx = {
      deviceAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      device: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(overrides?.deviceCount ?? 0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      sIPEndpoint: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      device: {
        findFirst: jest.fn().mockResolvedValue(overrides?.deviceFindFirst ?? null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      sIPEndpoint: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(async (fn) => {
        if (overrides?.transactionImpl) return overrides.transactionImpl(fn);
        return fn(tx);
      }),
    };

    const svc = new DeviceProvisioningCleanupService(
      prisma as never,
      redis as never,
      vault as never,
    );

    return { svc, prisma, redis, vault, tx };
  }

  it('releaseForDelete nulls MAC, clears Redis, and revokes vault secrets', async () => {
    const { svc, redis, vault, tx } = buildService();

    const result = await svc.releaseForDelete(tenantId, actorUserId, {
      id: deviceId,
      tenantId,
      macAddress: mac,
      sipEndpointId: 'sip-1',
    });

    expect(result.macCleared).toBe(true);
    expect(tx.device.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: deviceId },
        data: expect.objectContaining({
          macAddress: null,
          lineId: null,
          deletedAt: expect.any(Date),
          provisioningStatus: ProvisioningStatus.FAILED,
        }),
      }),
    );
    expect(redis.del).toHaveBeenCalledWith(`vsp:prov:mac:${mac}`);
    expect(redis.del).toHaveBeenCalledWith(`vsp:prov:quarantine:${mac}`);
    expect(vault.revokeProvHttp).toHaveBeenCalledWith(mac);
    expect(vault.revokeAdminPassword).toHaveBeenCalledWith(deviceId);
    expect(vault.revokeDeskSip).toHaveBeenCalledWith('sip-1');
  });

  it('clearDeviceProvisioning keeps line assignment fields untouched in DB update', async () => {
    const { svc, prisma, vault } = buildService();

    await svc.clearDeviceProvisioning(tenantId, actorUserId, {
      id: deviceId,
      tenantId,
      macAddress: mac,
      sipEndpointId: 'sip-1',
      lineId: 'line-1',
    });

    expect(prisma.device.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          macAddress: null,
          provisioningStatus: ProvisioningStatus.PENDING,
          status: DeviceStatus.PROVISIONING,
        }),
      }),
    );
    expect(vault.revokeProvHttp).toHaveBeenCalledWith(mac);
    expect(prisma.device.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lineId: null }) }),
    );
  });

  it('resetDeviceProvisioningState regenerates tokens without clearing MAC', async () => {
    const { svc, vault, prisma } = buildService();

    await svc.resetDeviceProvisioningState(tenantId, actorUserId, {
      id: deviceId,
      tenantId,
      macAddress: mac,
      sipEndpointId: 'sip-1',
    });

    expect(vault.revokeProvHttp).toHaveBeenCalledWith(mac);
    expect(vault.issueProvHttp).toHaveBeenCalledWith(mac);
    expect(vault.revokeAdminPassword).toHaveBeenCalledWith(deviceId);
    expect(vault.issueAdminPassword).toHaveBeenCalledWith(deviceId);
    expect(prisma.sIPEndpoint.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          registrationStatus: SIPEndpointStatus.UNREGISTERED,
        }),
      }),
    );
  });
});
