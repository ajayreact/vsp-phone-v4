import { BadRequestException, Injectable } from '@nestjs/common';
import {
  LineStatus,
  PresenceStatus,
  Prisma,
  type Extension,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { auditPbxMutation } from '../utils/tenant-pbx-audit';
import { newPublicId, tenantScope } from '../utils/tenant.util';

export type EnsureExtensionOptions = {
  displayName?: string;
  description?: string;
  departmentId?: string;
  phoneNumberId?: string;
  userId?: string;
};

@Injectable()
export class ExtensionAutoProvisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  defaultDisplayName(extension: string): string {
    return `Extension ${extension}`;
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

  async findByExtension(tenantId: string, extension: string) {
    return this.prisma.extension.findFirst({
      where: { tenantId, extension, ...tenantScope(tenantId) },
    });
  }
}
