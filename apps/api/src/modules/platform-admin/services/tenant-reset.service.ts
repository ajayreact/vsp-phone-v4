import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiKeyStatus,
  LineStatus,
  PhoneNumberStatus,
  TenantStatus,
  UserStatus,
  type Prisma,
} from '@prisma/client';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import {
  detachDidFromPriorExtension,
  unassignAllDidsInTenant,
} from '../../tenant-portal/utils/did-extension-binding';
import {
  assertConfirmPhrase,
  isProtectedTenantSlug,
  type LifecycleOp,
} from '../utils/tenant-lifecycle-confirm';
import type { TenantRecord } from './platform-tenants.service';

export type LifecycleConfirmDto = {
  confirmPhrase: string;
  acknowledged?: boolean;
};

export type FactoryResetResult = {
  tenant: TenantRecord;
  nextStep: 'onboarding';
  didsKept: number;
};

export type ResetPbxResult = {
  tenant: TenantRecord;
  didsUnassigned: number;
};

export type DeleteTenantResult = {
  tenant: TenantRecord;
  didsReleasedToInventory: number;
};

@Injectable()
export class TenantResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
    private readonly config: ConfigService,
  ) {}

  async resetPbx(
    tenantId: string,
    actorUserId: string,
    dto: LifecycleConfirmDto,
  ): Promise<ResetPbxResult> {
    const tenant = await this.requireMutableTenant(tenantId);
    this.assertConfirm(tenant.displayName, 'reset_pbx', dto.confirmPhrase);

    // Preserve PhoneNumber rows and DID↔extension bindings (lineId / CallerID / ownership).
    await this.prisma.$transaction(
      async (tx) => {
        await this.wipePbxOps(tx, tenantId, { preserveDidBindings: true });
      },
      { timeout: 120_000 },
    );

    const didsKept = await this.prisma.phoneNumber.count({
      where: { tenantId, deletedAt: null },
    });

    await this.audit.append({
      tenantId,
      actorUserId,
      actorType: 'admin',
      action: 'tenant.reset_pbx',
      resourceType: 'tenant',
      resourceId: tenantId,
      detail: { didsPreserved: didsKept, preserveDidBindings: true },
    });

    return {
      tenant: this.toRecord(await this.requireTenant(tenantId)),
      didsUnassigned: 0,
    };
  }

  /**
   * Reset Tenant (Re-Onboarding): wipe identity + PBX, keep shell + DID ownership → PENDING.
   * Alias: factoryReset (deprecated name).
   */
  async resetTenant(
    tenantId: string,
    actorUserId: string,
    dto: LifecycleConfirmDto,
  ): Promise<FactoryResetResult> {
    if (!dto.acknowledged) {
      throw new BadRequestException('You must acknowledge that Reset Tenant cannot be undone');
    }
    const tenant = await this.requireMutableTenant(tenantId);
    this.assertConfirm(tenant.displayName, 'reset_tenant', dto.confirmPhrase);

    const didsKept = await this.prisma.$transaction(
      async (tx) => {
        const n = await unassignAllDidsInTenant(tx, { tenantId, actorUserId });
        await this.wipePbxOps(tx, tenantId);
        await this.wipeTenantIdentity(tx, tenantId);
        await tx.tenant.update({
          where: { id: tenantId },
          data: { status: TenantStatus.PENDING, version: { increment: 1 } },
        });
        return n;
      },
      { timeout: 180_000 },
    );

    await this.audit.append({
      tenantId,
      actorUserId,
      actorType: 'admin',
      action: 'tenant.reset_tenant',
      resourceType: 'tenant',
      resourceId: tenantId,
      detail: { didsKept, nextStep: 'onboarding', alias: 're_onboarding' },
    });

    return {
      tenant: this.toRecord(await this.requireTenant(tenantId)),
      nextStep: 'onboarding',
      didsKept,
    };
  }

  /** @deprecated Use resetTenant */
  async factoryReset(
    tenantId: string,
    actorUserId: string,
    dto: LifecycleConfirmDto,
  ): Promise<FactoryResetResult> {
    return this.resetTenant(tenantId, actorUserId, dto);
  }

  async deleteTenant(
    tenantId: string,
    actorUserId: string,
    dto: LifecycleConfirmDto,
  ): Promise<DeleteTenantResult> {
    const tenant = await this.requireMutableTenant(tenantId);
    this.assertConfirm(tenant.displayName, 'delete', dto.confirmPhrase);

    const inventoryTenantId = await this.resolveInventoryTenantId();
    if (inventoryTenantId === tenantId) {
      throw new BadRequestException('Cannot delete the platform inventory tenant');
    }

    const didsReleased = await this.prisma.$transaction(
      async (tx) => {
        const n = await this.releaseDidsToInventory(tx, {
          tenantId,
          inventoryTenantId,
          actorUserId,
        });

        await tx.user.updateMany({
          where: { tenantId, deletedAt: null },
          data: {
            status: UserStatus.INACTIVE,
            deletedAt: new Date(),
            deletedBy: actorUserId,
          },
        });

        await tx.apiKey.updateMany({
          where: { tenantId, status: ApiKeyStatus.ACTIVE },
          data: { status: ApiKeyStatus.REVOKED },
        });

        await tx.extension.updateMany({
          where: { tenantId, deletedAt: null },
          data: { deletedAt: new Date(), deletedBy: actorUserId },
        });
        await tx.device.updateMany({
          where: { tenantId, deletedAt: null },
          data: { deletedAt: new Date(), deletedBy: actorUserId },
        });
        await tx.line.updateMany({
          where: { tenantId, deletedAt: null },
          data: {
            deletedAt: new Date(),
            deletedBy: actorUserId,
            status: LineStatus.INACTIVE,
          },
        });

        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            status: TenantStatus.DELETED,
            deletedAt: new Date(),
            deletedBy: actorUserId,
            version: { increment: 1 },
          },
        });

        return n;
      },
      { timeout: 120_000 },
    );

    await this.audit.append({
      tenantId,
      actorUserId,
      actorType: 'admin',
      action: 'tenant.deleted',
      resourceType: 'tenant',
      resourceId: tenantId,
      detail: { didsReleasedToInventory: didsReleased, inventoryTenantId },
    });

    const row = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!row) throw new NotFoundException('Tenant not found');
    return {
      tenant: this.toRecord(row),
      didsReleasedToInventory: didsReleased,
    };
  }

  /**
   * Wipe PBX operational trees.
   * When preserveDidBindings=true (Reset PBX): never touch PhoneNumber, and keep
   * lines/extensions/CallerID/number assignments so DID↔extension mapping survives.
   */
  private async wipePbxOps(
    tx: Prisma.TransactionClient,
    tenantId: string,
    opts: { preserveDidBindings?: boolean } = {},
  ): Promise<void> {
    const t = { tenantId };
    const preserve = Boolean(opts.preserveDidBindings);

    await tx.callParticipant.deleteMany({ where: t });
    await tx.recordingAnnotation.deleteMany({ where: t });
    await tx.recordingTranscript.deleteMany({ where: t });
    await tx.coachingNote.deleteMany({ where: t });
    await tx.recording.deleteMany({ where: t });
    await tx.callSession.deleteMany({ where: t });
    await tx.ivrInteractionLog.deleteMany({ where: t });

    await tx.voicemailMessage.deleteMany({ where: t });
    await tx.voicemailGreeting.deleteMany({ where: t });
    await tx.voicemail.deleteMany({ where: t });
    await tx.conferenceParticipant.deleteMany({ where: t });
    await tx.conference.deleteMany({ where: t });

    const panels = await tx.blfPanel.findMany({ where: t, select: { id: true } });
    for (const p of panels) {
      await tx.blfPanelKey.deleteMany({ where: { panelId: p.id } });
    }
    await tx.blfPanel.deleteMany({ where: t });
    await tx.pagingGroupMember.deleteMany({ where: t });
    await tx.pagingGroup.deleteMany({ where: t });

    await tx.queueCallback.deleteMany({ where: t });
    await tx.queueMember.deleteMany({ where: t });
    await tx.queue.deleteMany({ where: t });
    await tx.ringGroupMember.deleteMany({ where: t });
    await tx.ringGroup.deleteMany({ where: t });
    await tx.iVRMenu.deleteMany({ where: t });
    await tx.ivrFlowVersion.deleteMany({ where: t });
    await tx.iVR.deleteMany({ where: t });
    if (!preserve) {
      await tx.inboundRoute.deleteMany({ where: t });
    }
    await tx.outboundRoute.deleteMany({ where: t });
    await tx.dialPlanRule.deleteMany({ where: t });

    const timeConditions = await tx.timeCondition.findMany({ where: t, select: { id: true } });
    for (const row of timeConditions) {
      await tx.timeConditionRule.deleteMany({ where: { timeConditionId: row.id } });
    }
    await tx.timeCondition.deleteMany({ where: t });

    const calendars = await tx.holidayCalendar.findMany({ where: t, select: { id: true } });
    for (const c of calendars) {
      await tx.holiday.deleteMany({ where: { holidayCalendarId: c.id } });
    }
    await tx.holidayCalendar.deleteMany({ where: t });

    await tx.mohTrack.deleteMany({ where: t });
    await tx.mohPlaylistVersion.deleteMany({ where: t });
    await tx.mohPlaylist.deleteMany({ where: t });
    await tx.announcementVersion.deleteMany({ where: t });
    await tx.announcement.deleteMany({ where: t });

    await tx.contactRecent.deleteMany({ where: t });
    await tx.contact.deleteMany({ where: t });
    await tx.parkingLot.deleteMany({ where: t });

    if (!preserve) {
      await tx.numberAssignment.deleteMany({ where: t });
    }

    await tx.deviceAssignment.deleteMany({ where: t });
    await tx.presence.deleteMany({ where: t });
    await tx.device.deleteMany({ where: t });

    // Detach SIP endpoints from lines before delete (lines may be preserved for DID bindings).
    await tx.line.updateMany({
      where: { tenantId, sipEndpointId: { not: null } },
      data: { sipEndpointId: null },
    });
    await tx.sIPEndpoint.deleteMany({ where: t });

    if (!preserve) {
      await tx.callerID.deleteMany({ where: t });
      await tx.callPolicy.deleteMany({ where: t });
      await tx.recordingPolicy.deleteMany({ where: t });
      await tx.lineTelephonySettings.deleteMany({ where: t });
      await tx.extension.deleteMany({ where: t });
      await tx.line.deleteMany({ where: t });
    } else {
      // Operational policies can be cleared; keep CallerID + lines + extensions + number assignments.
      await tx.callPolicy.deleteMany({ where: t });
      await tx.recordingPolicy.deleteMany({ where: t });
    }

    await tx.provisioningTemplate.deleteMany({ where: t });
  }

  private async wipeTenantIdentity(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    await tx.auditLog.updateMany({
      where: { tenantId, actorUserId: { not: null } },
      data: { actorUserId: null },
    });

    await tx.apiKey.deleteMany({ where: { tenantId } });
    await tx.userRole.deleteMany({ where: { tenantId } });
    await tx.userSite.deleteMany({ where: { tenantId } });

    const customRoles = await tx.role.findMany({
      where: { tenantId, systemRole: false },
      select: { id: true },
    });
    for (const role of customRoles) {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    }
    await tx.role.deleteMany({ where: { tenantId, systemRole: false } });

    await tx.tenantSettings.updateMany({
      where: { tenantId },
      data: {
        businessEmail: null,
        businessPhone: null,
        website: null,
        industry: null,
        companySize: null,
        logoUrl: null,
        createdBy: null,
        updatedBy: null,
        deletedBy: null,
      },
    });

    await tx.siteSettings.deleteMany({ where: { tenantId } });
    await tx.site.deleteMany({ where: { tenantId } });
    await tx.department.deleteMany({ where: { tenantId } });
    await tx.userProfile.deleteMany({ where: { tenantId } });
    await tx.user.deleteMany({ where: { tenantId } });
  }

  private async releaseDidsToInventory(
    tx: Prisma.TransactionClient,
    params: { tenantId: string; inventoryTenantId: string; actorUserId: string },
  ): Promise<number> {
    const phones = await tx.phoneNumber.findMany({
      where: { tenantId: params.tenantId, deletedAt: null },
      select: { id: true },
    });

    for (const phone of phones) {
      await detachDidFromPriorExtension(tx, {
        phoneNumberId: phone.id,
        actorUserId: params.actorUserId,
        nextTenantId: params.inventoryTenantId,
        markUnassignedInTenant: false,
      });
      await tx.phoneNumber.update({
        where: { id: phone.id },
        data: {
          tenantId: params.inventoryTenantId,
          siteId: null,
          lineId: null,
          status: PhoneNumberStatus.ACTIVE,
          available: true,
          updatedBy: params.actorUserId,
        },
      });
    }
    return phones.length;
  }

  private async resolveInventoryTenantId(): Promise<string> {
    const settings = await this.prisma.platformSettings.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    const id =
      settings?.inventoryTenantId?.trim() ||
      this.config.get<string>('VSP_PLATFORM_INVENTORY_TENANT_ID')?.trim();
    if (!id) {
      throw new BadRequestException(
        'Platform Inventory Tenant is not configured. Set VSP_PLATFORM_INVENTORY_TENANT_ID.',
      );
    }
    return id;
  }

  private assertConfirm(displayName: string, op: LifecycleOp, phrase: string): void {
    try {
      assertConfirmPhrase(op, displayName, phrase);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid confirmation');
    }
  }

  private async requireMutableTenant(tenantId: string) {
    const row = await this.requireTenant(tenantId);
    if (isProtectedTenantSlug(row.slug)) {
      throw new BadRequestException('This tenant is protected and cannot be reset or deleted');
    }
    if (row.status === TenantStatus.DELETED || row.deletedAt) {
      throw new BadRequestException('Tenant is already deleted');
    }
    return row;
  }

  private async requireTenant(tenantId: string) {
    if (!this.prisma.connected) throw new NotFoundException('Tenant not found');
    const row = await this.prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!row) throw new NotFoundException('Tenant not found');
    return row;
  }

  private toRecord(t: {
    id: string;
    publicId: string;
    name: string;
    displayName: string;
    slug: string;
    status: TenantStatus;
    createdAt: Date;
    updatedAt: Date;
  }): TenantRecord {
    return {
      id: t.id,
      publicId: t.publicId,
      name: t.name,
      displayName: t.displayName,
      slug: t.slug,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
