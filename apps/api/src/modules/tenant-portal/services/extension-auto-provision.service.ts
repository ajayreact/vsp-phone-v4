import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DeviceStatus,
  DeviceType,
  LineStatus,
  PresenceStatus,
  Prisma,
  ProvisioningStatus,
  RouteDestinationType,
  VoicemailMailboxType,
  VoicemailStatus,
  type Extension,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import {
  DEFAULT_EXTENSION_START,
  canonicalExtensionNumber,
  defaultExtensionDisplayName,
  nextAvailableExtensionNumber,
  phoneNeedsExtensionRepair,
  tenantAdvisoryLockKeys,
} from '../utils/extension-auto-provision.util';
import {
  assertCanBindDidToLine,
  markLineActiveOnDidAttach,
} from '../utils/did-extension-binding';
import { newPublicId, tenantScope } from '../utils/tenant.util';
import { LineSipEndpointService } from './line-sip-endpoint.service';

export type EnsureExtensionOptions = {
  displayName?: string;
  description?: string;
  departmentId?: string;
  phoneNumberId?: string;
  userId?: string;
};

export {
  DEFAULT_EXTENSION_START,
  defaultExtensionDisplayName,
  extensionNeedsBusinessSetup,
  nextAvailableExtensionNumber,
} from '../utils/extension-auto-provision.util';

@Injectable()
export class ExtensionAutoProvisionService {
  private readonly logger = new Logger(ExtensionAutoProvisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
    private readonly lineSip: LineSipEndpointService,
  ) {}

  defaultDisplayName(extension: string): string {
    return defaultExtensionDisplayName(extension);
  }

  /**
   * Transaction-scoped advisory lock serializing extension allocation per tenant.
   * Must be called inside an interactive Prisma transaction.
   */
  async lockTenantExtensionAllocation(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    const [k1, k2] = tenantAdvisoryLockKeys(tenantId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${k1}, ${k2})`;
  }

  async allocateNextExtensionNumber(
    tenantId: string,
    startFrom = DEFAULT_EXTENSION_START,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const rows = await client.extension.findMany({
      where: { tenantId, deletedAt: null },
      select: { extension: true },
    });
    return nextAvailableExtensionNumber(
      rows.map((r) => r.extension),
      startFrom,
    );
  }

  async ensureExtension(
    tenantId: string,
    extension: string,
    actorUserId?: string,
    options: EnsureExtensionOptions = {},
    tx?: Prisma.TransactionClient,
  ): Promise<Extension> {
    const ext = extension.trim();
    if (!ext) throw new BadRequestException('Extension number is required');

    const run = async (client: Prisma.TransactionClient) => {
      const existing = await client.extension.findFirst({
        where: { tenantId, extension: ext, deletedAt: null },
      });
      if (existing) return existing;

      const displayName = options.displayName?.trim() || this.defaultDisplayName(ext);
      const lineId = randomUUID();

      await client.line.create({
        data: {
          id: lineId,
          publicId: newPublicId('line'),
          tenantId,
          userId: options.userId ?? null,
          name: displayName,
          status: LineStatus.ACTIVE,
          createdBy: actorUserId,
          presence: {
            create: {
              id: randomUUID(),
              tenantId,
              status: PresenceStatus.OFFLINE,
              createdBy: actorUserId,
            },
          },
          callerId: {
            create: {
              id: randomUUID(),
              tenantId,
              callerIdName: displayName,
              phoneNumberId: options.phoneNumberId ?? null,
              createdBy: actorUserId,
            },
          },
          callPolicy: {
            create: {
              id: randomUUID(),
              tenantId,
              inboundEnabled: true,
              outboundEnabled: true,
              createdBy: actorUserId,
            },
          },
          recordingPolicy: {
            create: {
              id: randomUUID(),
              tenantId,
              recordingEnabled: false,
              recordInbound: false,
              recordOutbound: false,
              createdBy: actorUserId,
            },
          },
          telephonySettings: {
            create: {
              id: randomUUID(),
              tenantId,
              createdBy: actorUserId,
            },
          },
        },
      });

      const created = await client.extension.create({
        data: {
          id: randomUUID(),
          tenantId,
          lineId,
          extension: ext,
          description: options.description?.trim() || null,
          departmentId: options.departmentId ?? null,
          createdBy: actorUserId,
        },
      });

      return created;
    };

    const result = tx
      ? await run(tx)
      : await this.prisma.$transaction(run);

    if (!tx) {
      await auditPbxMutation(this.audit, {
        tenantId,
        actorUserId,
        action: 'pbx.extension.auto_provision',
        entityType: 'Extension',
        entityId: result.id,
        metadata: { extension: ext, displayName: options.displayName ?? this.defaultDisplayName(ext) },
      });
    }

    return result;
  }

  /**
   * Idempotent Extension-First stub: line/extension/policies + voicemail +
   * SIP endpoint + WEBRTC device placeholder. Does not create users.
   */
  async ensureFullyProvisionedExtension(
    tenantId: string,
    extension: string,
    actorUserId?: string,
    options: EnsureExtensionOptions = {},
    tx?: Prisma.TransactionClient,
  ): Promise<Extension> {
    const extNumber = extension.trim();
    if (!extNumber) throw new BadRequestException('Extension number is required');

    const run = async (client: Prisma.TransactionClient) => {
      const ext = await this.ensureExtension(tenantId, extNumber, actorUserId, options, client);

      if (options.phoneNumberId) {
        await client.callerID.updateMany({
          where: { lineId: ext.lineId, tenantId, deletedAt: null },
          data: { phoneNumberId: options.phoneNumberId, updatedBy: actorUserId },
        });
      }

      const existingVm = await client.voicemail.findFirst({
        where: { lineId: ext.lineId, tenantId, deletedAt: null },
      });
      if (!existingVm) {
        await client.voicemail.create({
          data: {
            id: randomUUID(),
            publicId: newPublicId('vm'),
            tenantId,
            lineId: ext.lineId,
            name: this.defaultDisplayName(ext.extension),
            mailboxType: VoicemailMailboxType.PERSONAL,
            mailboxNumber: ext.extension,
            status: VoicemailStatus.ACTIVE,
            language: 'en',
            emailAttach: true,
            createdBy: actorUserId,
          },
        });
      }

      const endpoint = await this.lineSip.resolveOrCreateForLine(
        { tenantId, lineId: ext.lineId, actorUserId },
        client,
      );

      const existingWebrtc = await client.device.findFirst({
        where: {
          lineId: ext.lineId,
          tenantId,
          deletedAt: null,
          deviceType: DeviceType.WEBRTC,
        },
      });

      if (!existingWebrtc) {
        const line = await client.line.findFirst({
          where: { id: ext.lineId, tenantId, deletedAt: null },
          select: { userId: true },
        });
        const deviceId = randomUUID();
        await client.device.create({
          data: {
            id: deviceId,
            publicId: newPublicId('dev'),
            tenantId,
            lineId: ext.lineId,
            userId: options.userId ?? line?.userId ?? null,
            sipEndpointId: endpoint.id,
            name: `Softphone — Extension ${ext.extension}`,
            deviceType: DeviceType.WEBRTC,
            status: DeviceStatus.PROVISIONING,
            provisioningStatus: ProvisioningStatus.PENDING,
            createdBy: actorUserId,
          },
        });

        const assignmentUserId = options.userId ?? line?.userId;
        if (assignmentUserId) {
          await client.deviceAssignment.create({
            data: {
              id: randomUUID(),
              tenantId,
              deviceId,
              userId: assignmentUserId,
              lineId: ext.lineId,
              effectiveFrom: new Date(),
              createdBy: actorUserId,
            },
          });
        }
      }

      return ext;
    };

    const result = tx
      ? await run(tx)
      : await this.prisma.$transaction(run);

    if (!tx) {
      await auditPbxMutation(this.audit, {
        tenantId,
        actorUserId,
        action: 'pbx.extension.full_auto_provision',
        entityType: 'Extension',
        entityId: result.id,
        metadata: {
          extension: extNumber,
          phoneNumberId: options.phoneNumberId ?? null,
        },
      });
    }

    return result;
  }

  async findByExtension(tenantId: string, extension: string) {
    return this.prisma.extension.findFirst({
      where: { tenantId, extension, ...tenantScope(tenantId) },
    });
  }

  /**
   * One DID ↔ One Extension invariant: every tenant phone number has a live extension row.
   * Restores soft-deleted extensions when history exists; otherwise creates a Needs Setup stub.
   * Idempotent — safe before Extension Hub loads.
   */
  async ensureTenantDidExtensionPairs(
    tenantId: string,
    actorUserId?: string,
  ): Promise<{ repaired: number; created: number; restored: number }> {
    if (!this.prisma.connected) return { repaired: 0, created: 0, restored: 0 };

    const phones = await this.prisma.phoneNumber.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, number: true, lineId: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    if (!phones.length) return { repaired: 0, created: 0, restored: 0 };

    let repaired = 0;
    let created = 0;
    let restored = 0;

    for (const phone of phones) {
      const live = phone.lineId
        ? await this.prisma.extension.findFirst({
            where: { tenantId, lineId: phone.lineId, deletedAt: null },
            select: { id: true },
          })
        : null;

      if (!phoneNeedsExtensionRepair({ lineId: phone.lineId, hasLiveExtension: Boolean(live) })) {
        continue;
      }

      try {
        await this.prisma.$transaction(
          async (tx) => {
            await this.lockTenantExtensionAllocation(tx, tenantId);

            const restoredExt = await this.tryRestoreExtensionForPhone(
              tx,
              tenantId,
              phone.id,
              phone.lineId,
              actorUserId,
            );
            if (restoredExt) {
              await this.bindPhoneToExtensionLine(tx, {
                tenantId,
                phone,
                extension: restoredExt,
                actorUserId,
              });
              restored += 1;
              repaired += 1;
              return;
            }

            const extensionNumber = await this.allocateNextExtensionNumber(
              tenantId,
              DEFAULT_EXTENSION_START,
              tx,
            );
            const ext = await this.ensureExtensionLineForDid(
              tenantId,
              extensionNumber,
              actorUserId,
              { phoneNumberId: phone.id },
              tx,
            );
            await this.bindPhoneToExtensionLine(tx, {
              tenantId,
              phone,
              extension: ext,
              actorUserId,
            });
            created += 1;
            repaired += 1;
          },
          { timeout: 60_000 },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `DID extension repair failed tenant=${tenantId} phone=${phone.number} id=${phone.id}: ${msg}`,
        );
      }
    }

    if (repaired > 0) {
      this.logger.log(
        `DID extension repair tenant=${tenantId} repaired=${repaired} restored=${restored} created=${created}`,
      );
    }

    return { repaired, created, restored };
  }

  /** @deprecated Use ensureTenantDidExtensionPairs */
  async syncOrphanDidsToExtensions(
    tenantId: string,
    actorUserId?: string,
  ): Promise<{ created: number }> {
    const result = await this.ensureTenantDidExtensionPairs(tenantId, actorUserId);
    return { created: result.created + result.restored };
  }

  private async tryRestoreExtensionForPhone(
    tx: Prisma.TransactionClient,
    tenantId: string,
    phoneNumberId: string,
    currentLineId: string | null,
    actorUserId?: string,
  ) {
    const lineIds = new Set<string>();
    const extensionIds = new Set<string>();
    if (currentLineId) lineIds.add(currentLineId);

    const assignments = await tx.numberAssignment.findMany({
      where: { tenantId, phoneNumberId, deletedAt: null },
      orderBy: { effectiveFrom: 'desc' },
      take: 10,
      select: { lineId: true },
    });
    for (const a of assignments) {
      if (a.lineId) lineIds.add(a.lineId);
    }

    const routes = await tx.inboundRoute.findMany({
      where: { tenantId, phoneNumberId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { destinationLineId: true, destinationExtensionId: true },
    });
    for (const r of routes) {
      if (r.destinationLineId) lineIds.add(r.destinationLineId);
      if (r.destinationExtensionId) extensionIds.add(r.destinationExtensionId);
    }

    const extViaAssignment = await tx.extension.findFirst({
      where: {
        tenantId,
        line: { numberAssignments: { some: { phoneNumberId, deletedAt: null } } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (extViaAssignment) {
      extensionIds.add(extViaAssignment.id);
      lineIds.add(extViaAssignment.lineId);
    }

    for (const extensionId of extensionIds) {
      const ext = await tx.extension.findFirst({ where: { id: extensionId, tenantId } });
      if (!ext) continue;
      const restored = await this.reconcileExtensionForRepair(tx, tenantId, ext, actorUserId);
      if (restored) return restored;
    }

    for (const lineId of lineIds) {
      const ext = await tx.extension.findFirst({ where: { tenantId, lineId } });
      if (!ext) continue;
      const restored = await this.reconcileExtensionForRepair(tx, tenantId, ext, actorUserId);
      if (restored) return restored;
    }

    return null;
  }

  private async reconcileExtensionForRepair(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ext: Extension,
    actorUserId?: string,
  ): Promise<Extension | null> {
    if (ext.deletedAt) {
      return this.restoreSoftDeletedExtension(tx, tenantId, ext, actorUserId);
    }

    const line = await tx.line.findFirst({ where: { id: ext.lineId, tenantId } });
    if (!line) return null;
    if (line.deletedAt) {
      await tx.line.update({
        where: { id: line.id },
        data: {
          deletedAt: null,
          deletedBy: null,
          status: LineStatus.ACTIVE,
          updatedBy: actorUserId,
        },
      });
    }
    return ext;
  }

  private async restoreSoftDeletedExtension(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ext: Extension,
    actorUserId?: string,
  ): Promise<Extension> {
    const preferred = canonicalExtensionNumber(ext.extension) ?? ext.extension;
    const conflict = await tx.extension.findFirst({
      where: {
        tenantId,
        extension: preferred,
        deletedAt: null,
        id: { not: ext.id },
      },
      select: { id: true },
    });
    const extensionNumber = conflict
      ? await this.allocateNextExtensionNumber(tenantId, DEFAULT_EXTENSION_START, tx)
      : preferred;
    const displayName = this.defaultDisplayName(extensionNumber);

    await tx.line.update({
      where: { id: ext.lineId },
      data: {
        deletedAt: null,
        deletedBy: null,
        status: LineStatus.ACTIVE,
        userId: null,
        name: displayName,
        updatedBy: actorUserId,
      },
    });

    await tx.callPolicy.updateMany({
      where: { lineId: ext.lineId, tenantId },
      data: { deletedAt: null, deletedBy: null, inboundEnabled: true, outboundEnabled: true },
    });
    await tx.recordingPolicy.updateMany({
      where: { lineId: ext.lineId, tenantId },
      data: {
        deletedAt: null,
        deletedBy: null,
        recordingEnabled: false,
        recordInbound: false,
        recordOutbound: false,
      },
    });
    await tx.callerID.updateMany({
      where: { lineId: ext.lineId, tenantId },
      data: { deletedAt: null, deletedBy: null, callerIdName: displayName },
    });
    await tx.voicemail.updateMany({
      where: { lineId: ext.lineId, tenantId },
      data: { deletedAt: null, deletedBy: null, lineId: ext.lineId, name: displayName },
    });

    return tx.extension.update({
      where: { id: ext.id },
      data: {
        deletedAt: null,
        deletedBy: null,
        archivedAt: null,
        extension: extensionNumber,
        description: null,
        departmentId: null,
        updatedBy: actorUserId,
      },
    });
  }

  private async bindPhoneToExtensionLine(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      phone: { id: string; number: string; lineId: string | null };
      extension: Extension;
      actorUserId?: string;
    },
  ): Promise<void> {
    const { tenantId, phone, extension, actorUserId } = params;

    await assertCanBindDidToLine(tx, {
      tenantId,
      phoneNumberId: phone.id,
      lineId: extension.lineId,
    });

    await tx.phoneNumber.update({
      where: { id: phone.id },
      data: { lineId: extension.lineId, updatedBy: actorUserId },
    });
    await markLineActiveOnDidAttach(tx, extension.lineId, actorUserId);

    await tx.callerID.updateMany({
      where: { lineId: extension.lineId, tenantId, deletedAt: null },
      data: { phoneNumberId: phone.id, callerIdName: defaultExtensionDisplayName(extension.extension), updatedBy: actorUserId },
    });

    const openAssignment = await tx.numberAssignment.findFirst({
      where: {
        tenantId,
        phoneNumberId: phone.id,
        effectiveTo: null,
        deletedAt: null,
      },
    });
    if (!openAssignment) {
      await tx.numberAssignment.create({
        data: {
          id: randomUUID(),
          tenantId,
          phoneNumberId: phone.id,
          lineId: extension.lineId,
          effectiveFrom: new Date(),
          createdBy: actorUserId,
        },
      });
    } else if (openAssignment.lineId !== extension.lineId) {
      await tx.numberAssignment.update({
        where: { id: openAssignment.id },
        data: { lineId: extension.lineId, updatedBy: actorUserId },
      });
    }

    const liveRoute = await tx.inboundRoute.findFirst({
      where: { tenantId, phoneNumberId: phone.id, deletedAt: null },
    });
    if (liveRoute) {
      await tx.inboundRoute.update({
        where: { id: liveRoute.id },
        data: {
          enabled: true,
          destinationType: RouteDestinationType.EXTENSION,
          destinationLineId: extension.lineId,
          destinationExtensionId: extension.id,
          updatedBy: actorUserId,
        },
      });
    } else {
      await tx.inboundRoute.create({
        data: {
          id: randomUUID(),
          tenantId,
          name: `DID ${phone.number}`,
          phoneNumberId: phone.id,
          priority: 100,
          enabled: true,
          createdBy: actorUserId,
          destinationType: RouteDestinationType.EXTENSION,
          destinationLineId: extension.lineId,
          destinationExtensionId: extension.id,
        },
      });
    }

    await this.lineSip.resolveOrCreateForLine(
      { tenantId, lineId: extension.lineId, actorUserId },
      tx,
    );
  }

  /**
   * Extension + line + policies + voicemail + SIP for a DID. No devices (Needs Setup).
   */
  async ensureExtensionLineForDid(
    tenantId: string,
    extension: string,
    actorUserId?: string,
    options: EnsureExtensionOptions = {},
    tx?: Prisma.TransactionClient,
  ): Promise<Extension> {
    const extNumber = extension.trim();
    if (!extNumber) throw new BadRequestException('Extension number is required');

    const run = async (client: Prisma.TransactionClient) => {
      const ext = await this.ensureExtension(tenantId, extNumber, actorUserId, options, client);

      if (options.phoneNumberId) {
        await client.callerID.updateMany({
          where: { lineId: ext.lineId, tenantId, deletedAt: null },
          data: { phoneNumberId: options.phoneNumberId, updatedBy: actorUserId },
        });
      }

      const existingVm = await client.voicemail.findFirst({
        where: { lineId: ext.lineId, tenantId, deletedAt: null },
      });
      if (!existingVm) {
        await client.voicemail.create({
          data: {
            id: randomUUID(),
            publicId: newPublicId('vm'),
            tenantId,
            lineId: ext.lineId,
            name: this.defaultDisplayName(ext.extension),
            mailboxType: VoicemailMailboxType.PERSONAL,
            mailboxNumber: ext.extension,
            status: VoicemailStatus.ACTIVE,
            language: 'en',
            emailAttach: true,
            createdBy: actorUserId,
          },
        });
      }

      await this.lineSip.resolveOrCreateForLine(
        { tenantId, lineId: ext.lineId, actorUserId },
        client,
      );

      return ext;
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }
}
