/**
 * Integration-style verification: desk enroll reuses Line SIP endpoint;
 * multiple desk devices share one AOR; MAC conflict remains 409.
 */
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeviceStatus, DeviceType, TenantStatus } from '@prisma/client';
import { DeviceEnrollmentService } from './device-enrollment.service';
import { LineSipEndpointService } from '../../tenant-portal/services/line-sip-endpoint.service';

describe('multi-device SIP enroll (integration)', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const lineId = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';
  const sharedSipId = '44444444-4444-4444-4444-444444444444';
  const aor = 'sip:101@acme.sip.vsp.internal';

  const lineRow = {
    id: lineId,
    userId,
    name: 'Ajay',
    extension: { extension: '101' },
    user: { username: 'ajay', email: 'ajay@example.com' },
    tenant: {
      slug: 'acme',
      status: TenantStatus.ACTIVE,
      settings: { timezone: 'UTC', defaultLanguage: 'en' },
    },
  };

  function buildEnrollment(opts?: { existingMac?: string }) {
    const createdDevices: Array<{ sipEndpointId: string; macAddress: string; deviceType: DeviceType }> =
      [];
    let sipCreateCount = 0;

    const endpoint = {
      id: sharedSipId,
      aor,
      authUsername: '101',
      deletedAt: null,
    };

    const tx = {
      line: {
        findFirst: jest.fn().mockResolvedValue({
          ...lineRow,
          sipEndpointId: sharedSipId,
          sipEndpoint: endpoint,
          tenant: { slug: 'acme' },
        }),
        update: jest.fn(),
      },
      sIPEndpoint: {
        findFirst: jest.fn().mockResolvedValue(endpoint),
        create: jest.fn().mockImplementation(async () => {
          sipCreateCount += 1;
          return endpoint;
        }),
      },
      device: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: { macAddress?: string } }) => {
          if (where.macAddress && opts?.existingMac === where.macAddress) {
            return { id: 'existing', macAddress: where.macAddress };
          }
          return null;
        }),
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          createdDevices.push({
            sipEndpointId: String(data.sipEndpointId),
            macAddress: String(data.macAddress),
            deviceType: data.deviceType as DeviceType,
          });
          return data;
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      deviceAssignment: { create: jest.fn().mockResolvedValue({}) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: userId }) },
      provisioningTemplate: { findFirst: jest.fn() },
    };

    const prisma = {
      connected: true,
      line: {
        findFirst: jest.fn().mockResolvedValue(lineRow),
      },
      device: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: { macAddress?: string } }) => {
          if (where.macAddress && opts?.existingMac === where.macAddress) {
            return { id: 'existing', macAddress: where.macAddress };
          }
          return null;
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      provisioningTemplate: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const config = {
      get: (k: string, d?: string) => (k === 'SIP_PLATFORM_DOMAIN' ? 'vsp.internal' : d),
    } as unknown as ConfigService;

    const lineSip = new LineSipEndpointService(prisma as never, config);

    const vault = {
      resolveDeskSipPassword: jest.fn().mockReturnValue('existing-secret'),
      issueDeskSip: jest.fn().mockReturnValue({ password: 'x', version: 'v1' }),
      resolveProvHttp: jest.fn().mockReturnValue(null),
      issueProvHttp: jest.fn().mockReturnValue({ username: 'mac', password: 'p', version: 'pv1' }),
      issueAdminPassword: jest.fn().mockReturnValue('admin'),
    };

    const generator = {
      generate: jest.fn().mockResolvedValue({
        xml: '<cfg/>',
        artifactHash: 'hash',
        objectKey: 'key',
        templateVersion: '1',
        configVersion: 1,
        provUrl: 'https://prov.example/cfg.xml',
        firmwareVersion: '1.0.0',
      }),
    };

    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      macIndexKey: (mac: string) => `mac:${mac}`,
      deviceMetaKey: () => 'meta',
      artifactHistoryKey: () => 'hist',
      hset: jest.fn(),
      lpush: jest.fn(),
    };

    const audit = { log: jest.fn() };

    const svc = new DeviceEnrollmentService(
      prisma as never,
      redis as never,
      vault as never,
      generator as never,
      audit as never,
      lineSip,
      config,
    );

    return { svc, tx, createdDevices, getSipCreateCount: () => sipCreateCount, vault };
  }

  const user = { sub: userId, tenantId, email: 'admin@acme.test' };

  it('attaches WebRTC + two desk phones to one SIP endpoint / AOR (no duplicate SIP create)', async () => {
    const { svc, createdDevices, getSipCreateCount, vault } = buildEnrollment();

    await svc.enroll(user, {
      mac: 'EC74D7A0F4FC',
      name: 'Desk 1',
      lineId,
      manufacturer: 'GRANDSTREAM',
      modelFamily: 'grp260x',
    });
    await svc.enroll(user, {
      mac: 'AABBCCDDEEFF',
      name: 'Desk 2',
      lineId,
      manufacturer: 'GRANDSTREAM',
      modelFamily: 'grp260x',
    });

    expect(createdDevices).toHaveLength(2);
    expect(createdDevices.every((d) => d.sipEndpointId === sharedSipId)).toBe(true);
    expect(createdDevices.every((d) => d.deviceType === DeviceType.DESK_PHONE)).toBe(true);
    expect(getSipCreateCount()).toBe(0);
    // Shared endpoint secret must not be rotated when already present
    expect(vault.issueDeskSip).not.toHaveBeenCalled();
  });

  it('returns ConflictException for duplicate MAC (genuine device conflict)', async () => {
    const { svc } = buildEnrollment({ existingMac: 'ec74d7a0f4fc' });

    await expect(
      svc.enroll(user, {
        mac: 'EC74D7A0F4FC',
        name: 'Desk',
        lineId,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns PROVISIONING device status after successful enroll', async () => {
    const { svc } = buildEnrollment();
    const result = await svc.enroll(user, {
      mac: '112233445566',
      name: 'Desk',
      lineId,
    });
    expect(result.status).toBe(DeviceStatus.PROVISIONING);
    expect(result.deviceId).toBeTruthy();
  });
});
