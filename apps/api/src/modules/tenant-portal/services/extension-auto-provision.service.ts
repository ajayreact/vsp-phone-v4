import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DeviceStatus,
  DeviceType,
  LineStatus,
  PresenceStatus,
  Prisma,
  ProvisioningStatus,
  VoicemailMailboxType,
  VoicemailStatus,
  type Extension,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import {
  defaultExtensionDisplayName,
  nextAvailableExtensionNumber,
} from '../utils/extension-auto-provision.util';
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
  defaultExtensionDisplayName,
  extensionNeedsBusinessSetup,
  nextAvailableExtensionNumber,
} from '../utils/extension-auto-provision.util';

@Injectable()
export class ExtensionAutoProvisionService {
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
    const hex = tenantId.replace(/-/g, '');
    const k1 = Number.parseInt(hex.slice(0, 8), 16) || 1;
    const k2 = Number.parseInt(hex.slice(8, 16), 16) || 1;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${k1}, ${k2})`;
  }

  async allocateNextExtensionNumber(
    tenantId: string,
    startFrom = 101,
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
}
