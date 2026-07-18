import { BadRequestException } from '@nestjs/common';
import { PhoneNumberStatus, TenantStatus } from '@prisma/client';
import { TenantResetService } from './tenant-reset.service';

describe('TenantResetService', () => {
  const tenant = {
    id: 'tenant-1',
    publicId: 't_demo',
    name: 'Demo',
    displayName: 'Demo Co',
    slug: 'demo',
    status: TenantStatus.ACTIVE,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
  };

  const inventoryId = 'inventory-tenant';

  function phoneStubs(phones: Array<{ id: string; tenantId?: string; lineId?: string | null }>) {
    return {
      findMany: jest.fn().mockResolvedValue(phones.map((p) => ({ id: p.id }))),
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        const hit = phones.find((p) => p.id === where.id);
        return Promise.resolve(
          hit
            ? {
                id: hit.id,
                tenantId: hit.tenantId ?? tenant.id,
                lineId: hit.lineId ?? null,
              }
            : null,
        );
      }),
      count: jest.fn().mockResolvedValue(phones.length),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
  }

  function buildService(
    phones: Array<{ id: string; tenantId?: string; lineId?: string | null }> = [],
  ) {
    const phoneNumber = phoneStubs(phones);
    const tx = {
      phoneNumber,
      numberAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), deleteMany: jest.fn() },
      inboundRoute: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), deleteMany: jest.fn() },
      callerID: { updateMany: jest.fn(), deleteMany: jest.fn() },
      line: { update: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
      user: { updateMany: jest.fn(), deleteMany: jest.fn() },
      apiKey: { updateMany: jest.fn(), deleteMany: jest.fn() },
      extension: { updateMany: jest.fn(), deleteMany: jest.fn() },
      device: { updateMany: jest.fn(), deleteMany: jest.fn() },
      tenant: { update: jest.fn().mockResolvedValue(tenant) },
      callParticipant: { deleteMany: jest.fn() },
      recordingAnnotation: { deleteMany: jest.fn() },
      recordingTranscript: { deleteMany: jest.fn() },
      coachingNote: { deleteMany: jest.fn() },
      recording: { deleteMany: jest.fn() },
      callSession: { deleteMany: jest.fn() },
      ivrInteractionLog: { deleteMany: jest.fn() },
      voicemailMessage: { deleteMany: jest.fn() },
      voicemailGreeting: { deleteMany: jest.fn() },
      voicemail: { deleteMany: jest.fn() },
      conferenceParticipant: { deleteMany: jest.fn() },
      conference: { deleteMany: jest.fn() },
      blfPanel: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
      blfPanelKey: { deleteMany: jest.fn() },
      pagingGroupMember: { deleteMany: jest.fn() },
      pagingGroup: { deleteMany: jest.fn() },
      queueCallback: { deleteMany: jest.fn() },
      queueMember: { deleteMany: jest.fn() },
      queue: { deleteMany: jest.fn() },
      ringGroupMember: { deleteMany: jest.fn() },
      ringGroup: { deleteMany: jest.fn() },
      iVRMenu: { deleteMany: jest.fn() },
      ivrFlowVersion: { deleteMany: jest.fn() },
      iVR: { deleteMany: jest.fn() },
      outboundRoute: { deleteMany: jest.fn() },
      dialPlanRule: { deleteMany: jest.fn() },
      timeCondition: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
      timeConditionRule: { deleteMany: jest.fn() },
      holidayCalendar: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
      holiday: { deleteMany: jest.fn() },
      mohTrack: { deleteMany: jest.fn() },
      mohPlaylistVersion: { deleteMany: jest.fn() },
      mohPlaylist: { deleteMany: jest.fn() },
      announcementVersion: { deleteMany: jest.fn() },
      announcement: { deleteMany: jest.fn() },
      contactRecent: { deleteMany: jest.fn() },
      contact: { deleteMany: jest.fn() },
      parkingLot: { deleteMany: jest.fn() },
      deviceAssignment: { deleteMany: jest.fn() },
      presence: { deleteMany: jest.fn() },
      sIPEndpoint: { deleteMany: jest.fn() },
      callPolicy: { deleteMany: jest.fn() },
      recordingPolicy: { deleteMany: jest.fn() },
      lineTelephonySettings: { deleteMany: jest.fn() },
      provisioningTemplate: { deleteMany: jest.fn() },
      auditLog: { updateMany: jest.fn() },
      userRole: { deleteMany: jest.fn() },
      userSite: { deleteMany: jest.fn() },
      role: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
      rolePermission: { deleteMany: jest.fn() },
      tenantSettings: { updateMany: jest.fn() },
      siteSettings: { deleteMany: jest.fn() },
      site: { deleteMany: jest.fn() },
      department: { deleteMany: jest.fn() },
      userProfile: { deleteMany: jest.fn() },
    };

    const prisma = {
      connected: true,
      tenant: {
        findFirst: jest.fn().mockResolvedValue(tenant),
      },
      phoneNumber,
      platformSettings: {
        findFirst: jest.fn().mockResolvedValue({ inventoryTenantId: inventoryId }),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    const audit = { append: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn().mockReturnValue(inventoryId) };
    const service = new TenantResetService(prisma as never, audit as never, config as never);
    return { service, prisma, audit, tx, phoneNumber };
  }

  it('rejects protected tenant slugs', async () => {
    const { service, prisma } = buildService();
    prisma.tenant.findFirst.mockResolvedValue({ ...tenant, slug: 'inventory' });
    await expect(
      service.resetPbx(tenant.id, 'actor', { confirmPhrase: 'RESET PBX Demo Co' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects wrong confirm phrase', async () => {
    const { service } = buildService();
    await expect(
      service.resetPbx(tenant.id, 'actor', { confirmPhrase: 'WRONG' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resetTenant requires acknowledgement', async () => {
    const { service } = buildService();
    await expect(
      service.resetTenant(tenant.id, 'actor', {
        confirmPhrase: 'RESET Demo Co',
        acknowledged: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resetTenant sets PENDING and does not move DIDs to inventory', async () => {
    const { service, audit, tx, phoneNumber } = buildService([{ id: 'pn-1' }]);
    const result = await service.resetTenant(tenant.id, 'actor', {
      confirmPhrase: 'RESET Demo Co',
      acknowledged: true,
    });
    expect(result.nextStep).toBe('onboarding');
    expect(result.didsKept).toBe(1);
    expect(tx.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: TenantStatus.PENDING }),
      }),
    );
    const moved = phoneNumber.update.mock.calls.some(
      (call: unknown[]) =>
        typeof call[0] === 'object' &&
        call[0] !== null &&
        (call[0] as { data?: { tenantId?: string } }).data?.tenantId === inventoryId,
    );
    expect(moved).toBe(false);
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.reset_tenant' }),
    );
  });

  it('resetPbx keeps tenant ACTIVE and leaves PhoneNumber bindings untouched', async () => {
    const { service, audit, phoneNumber, tx } = buildService([{ id: 'pn-1' }]);
    const result = await service.resetPbx(tenant.id, 'actor', {
      confirmPhrase: 'RESET PBX Demo Co',
    });
    expect(result.didsUnassigned).toBe(0);
    expect(phoneNumber.update).not.toHaveBeenCalled();
    expect(phoneNumber.updateMany).not.toHaveBeenCalled();
    expect(tx.extension.deleteMany).not.toHaveBeenCalled();
    expect(tx.line.deleteMany).not.toHaveBeenCalled();
    expect(tx.callerID.deleteMany).not.toHaveBeenCalled();
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.reset_pbx',
        detail: expect.objectContaining({ preserveDidBindings: true }),
      }),
    );
  });

  it('deleteTenant moves DIDs to inventory and sets DELETED', async () => {
    const { service, audit, tx, phoneNumber } = buildService([{ id: 'pn-1' }]);
    const result = await service.deleteTenant(tenant.id, 'actor', {
      confirmPhrase: 'DELETE Demo Co',
    });

    expect(result.didsReleasedToInventory).toBe(1);
    expect(phoneNumber.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pn-1' },
        data: expect.objectContaining({
          tenantId: inventoryId,
          status: PhoneNumberStatus.ACTIVE,
          available: true,
          lineId: null,
        }),
      }),
    );
    expect(tx.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: TenantStatus.DELETED }),
      }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.deleted' }),
    );
  });
});
