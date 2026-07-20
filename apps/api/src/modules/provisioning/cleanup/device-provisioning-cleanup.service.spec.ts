import { DeviceStatus, ProvisioningStatus, SIPEndpointStatus } from '@prisma/client';
import { DeviceProvisioningCleanupService } from './device-provisioning-cleanup.service';

describe('DeviceProvisioningCleanupService', () => {
  const tenantId = 'tenant-1';
  const actorUserId = 'user-1';
  const deviceId = 'device-1';
  const mac = 'ec74d751e3e7';

  function buildService(overrides?: {
    deviceFindFirst?: unknown;
    deviceFindMany?: unknown[];
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
        findMany: jest.fn().mockResolvedValue(overrides?.deviceFindMany ?? []),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

  it('releaseDevicesOnLine uses releaseForDelete for each device on the line', async () => {
    const deviceFindMany = [
      { id: deviceId, macAddress: mac, sipEndpointId: 'sip-1' },
      { id: 'device-2', macAddress: null, sipEndpointId: 'sip-1' },
    ];
    const { svc, prisma } = buildService({ deviceFindMany });
    const releaseSpy = jest.spyOn(svc, 'releaseForDelete').mockResolvedValue({
      macCleared: true,
      sipCleared: false,
    });

    const result = await svc.releaseDevicesOnLine(tenantId, 'line-1', actorUserId);

    expect(result.deviceIds).toEqual([deviceId, 'device-2']);
    expect(result.sipEndpointIds).toEqual(['sip-1']);
    expect(releaseSpy).toHaveBeenCalledTimes(2);
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, lineId: 'line-1', deletedAt: null } }),
    );
  });

  it('releaseAllActiveDevices delegates to releaseForDelete for each active device', async () => {
    const { svc } = buildService({
      deviceFindMany: [{ id: deviceId, macAddress: mac, sipEndpointId: 'sip-1' }],
    });
    const releaseSpy = jest.spyOn(svc, 'releaseForDelete').mockResolvedValue({
      macCleared: true,
      sipCleared: true,
    });

    const count = await svc.releaseAllActiveDevices(tenantId, actorUserId);

    expect(count).toBe(1);
    expect(releaseSpy).toHaveBeenCalledTimes(1);
  });

  it('assertMacAvailable heals soft-deleted device rows that still hold MAC', async () => {
    const deletedAt = new Date('2026-07-01T00:00:00.000Z');
    const { svc, prisma, redis, vault } = buildService({
      deviceFindFirst: {
        id: deviceId,
        tenantId,
        deletedAt,
        macAddress: mac,
        sipEndpointId: 'sip-1',
        status: DeviceStatus.INACTIVE,
        line: { extension: { extension: '101' } },
      },
    });

    await expect(svc.assertMacAvailable(mac)).resolves.toBeUndefined();

    expect(prisma.device.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: deviceId, tenantId, macAddress: mac },
        data: expect.objectContaining({ macAddress: null }),
      }),
    );
    expect(redis.del).toHaveBeenCalledWith(`vsp:prov:mac:${mac}`);
    expect(vault.revokeProvHttp).toHaveBeenCalledWith(mac);
  });

  it('repairSoftDeletedDeviceMacBindings clears MAC on all soft-deleted devices', async () => {
    const { svc, prisma, vault } = buildService({
      deviceFindMany: [
        {
          id: deviceId,
          tenantId,
          macAddress: mac,
          sipEndpointId: 'sip-1',
          deletedAt: new Date(),
          status: DeviceStatus.INACTIVE,
          line: { extension: { extension: '101' } },
        },
      ],
    });

    const repaired = await svc.repairSoftDeletedDeviceMacBindings();

    expect(repaired).toBe(1);
    expect(prisma.device.updateMany).toHaveBeenCalled();
    expect(vault.revokeProvHttp).toHaveBeenCalledWith(mac);
  });
});
