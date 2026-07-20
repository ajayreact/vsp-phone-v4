import { ConflictException } from '@nestjs/common';
import { DeviceType } from '@prisma/client';
import { TenantDevicesService } from './tenant-devices.service';

describe('TenantDevicesService.create (Add Device)', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const lineId = '33333333-3333-3333-3333-333333333333';

  function buildService(overrides?: {
    createImpl?: jest.Mock;
    findFirstImpl?: jest.Mock;
  }) {
    const deviceRow = {
      id: '44444444-4444-4444-4444-444444444444',
      publicId: 'dev_test',
      tenantId,
      lineId,
      name: 'Ext Softphone',
      deviceType: DeviceType.WEBRTC,
      manufacturer: null,
      macAddress: null,
      ipAddress: null,
    };

    const prisma = {
      connected: true,
      device: {
        findFirst: overrides?.findFirstImpl ?? jest.fn().mockResolvedValue(null),
        create: overrides?.createImpl ?? jest.fn().mockResolvedValue(deviceRow),
      },
    };

    const audit = { append: jest.fn().mockResolvedValue(undefined) };
    const enrollment = { enroll: jest.fn() };
    const redis = {
      hgetall: jest.fn().mockResolvedValue({}),
      lrange: jest.fn().mockResolvedValue([]),
      deviceMetaKey: (t: string, d: string) => `vsp:${t}:prov:device:${d}:meta`,
      artifactHistoryKey: (t: string, d: string) => `vsp:${t}:prov:device:${d}:history`,
    };

    const provisioningCleanup = {
      assertMacAvailable: jest.fn().mockResolvedValue(undefined),
      releaseForDelete: jest.fn(),
      clearDeviceProvisioning: jest.fn(),
      resetDeviceProvisioningState: jest.fn(),
    };
    const orchestrator = { reprovision: jest.fn() };

    const service = new TenantDevicesService(
      prisma as never,
      audit as never,
      enrollment as never,
      redis as never,
      provisioningCleanup as never,
      orchestrator as never,
    );

    return { service, prisma, audit, enrollment, redis, provisioningCleanup, deviceRow };
  }

  it('POST inventory path: WEBRTC softphone writes device then enriches', async () => {
    const { service, prisma, enrollment } = buildService();

    const result = await service.create(tenantId, userId, {
      name: 'Alice Softphone',
      deviceType: DeviceType.WEBRTC,
      lineId,
    });

    expect(enrollment.enroll).not.toHaveBeenCalled();
    expect(prisma.device.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId,
          lineId,
          deviceType: DeviceType.WEBRTC,
          name: 'Alice Softphone',
          createdBy: userId,
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ name: 'Ext Softphone', provUrl: null }));
  });

  it('POST enroll path: DESK_PHONE + MAC + line delegates to enrollment', async () => {
    const { service, enrollment, prisma, redis } = buildService();
    const enrolledId = '55555555-5555-5555-5555-555555555555';
    enrollment.enroll.mockResolvedValue({ deviceId: enrolledId, mac: 'aabbccddeeff' });
    prisma.device.findFirst = jest.fn().mockResolvedValue({
      id: enrolledId,
      publicId: 'dev_enroll',
      tenantId,
      lineId,
      name: 'Desk',
      deviceType: DeviceType.DESK_PHONE,
      manufacturer: 'YEALINK',
      macAddress: 'aabbccddeeff',
      ipAddress: null,
    });

    await service.create(tenantId, userId, {
      name: 'Desk',
      deviceType: DeviceType.DESK_PHONE,
      lineId,
      macAddress: 'AA:BB:CC:DD:EE:FF',
      manufacturer: 'YEALINK' as never,
    });

    expect(enrollment.enroll).toHaveBeenCalled();
    expect(prisma.device.create).not.toHaveBeenCalled();
    expect(redis.hgetall).toHaveBeenCalled();
  });

  it('surfaces Prisma errors with structured service_error (not swallowed)', async () => {
    const prismaErr = new Error(
      'Foreign key constraint failed on the field: `devices_created_by_fkey (index)`',
    );
    const { service } = buildService({
      createImpl: jest.fn().mockRejectedValue(prismaErr),
    });

    await expect(
      service.create(tenantId, userId, {
        name: 'Broken',
        deviceType: DeviceType.MOBILE,
        lineId,
      }),
    ).rejects.toThrow(/Foreign key constraint failed/);
  });

  it('rejects duplicate MAC before write', async () => {
    const { service, provisioningCleanup } = buildService();
    provisioningCleanup.assertMacAvailable.mockRejectedValue(
      new ConflictException({ code: 'MAC_ALREADY_EXISTS', message: 'duplicate' }),
    );

    await expect(
      service.create(tenantId, userId, {
        name: 'Dup',
        deviceType: DeviceType.SIP,
        macAddress: '001122334455',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
