import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { QueueStatus, TenantStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { SecurityAuditService } from '../../enterprise-security/audit/security-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import type { MigrationPayload } from '../types/migration.types';

export const PRODUCTION_IMPORT_CONFIRM = 'I_CONFIRM_PRODUCTION_IMPORT';

/** Remediation H-05 — optional Prisma production import (transactional; Super Admin only). */
@Injectable()
export class MigrationDatabaseImportService {
  private readonly logger = new Logger(MigrationDatabaseImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SecurityAuditService,
  ) {}

  async importToDatabase(params: {
    payload: MigrationPayload;
    actorUserId: string;
    tenantId?: string;
  }): Promise<{ imported: number; byType: Record<string, number>; errors: string[] }> {
    if (params.payload.productionImportConfirm !== PRODUCTION_IMPORT_CONFIRM) {
      throw new BadRequestException(
        `productionImportConfirm must be "${PRODUCTION_IMPORT_CONFIRM}"`,
      );
    }
    if (!this.prisma.connected) {
      throw new BadRequestException('Database unavailable for production import');
    }

    const byType: Record<string, number> = {};
    const errors: string[] = [];
    let imported = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const row of params.payload.data.tenant ?? []) {
        const legacyId = String(row.legacyId ?? row.id ?? '');
        const uuid =
          params.payload.mappings?.tenants?.[legacyId] ??
          (typeof row.platformUuid === 'string' ? row.platformUuid : randomUUID());
        const name = String(row.name ?? 'Migrated Tenant');
        const slug = String(row.slug ?? name.toLowerCase().replace(/\W+/g, '-').slice(0, 48));
        const publicId = `t-${createHash('sha256').update(legacyId || uuid).digest('hex').slice(0, 12)}`;

        const existing = await tx.tenant.findFirst({ where: { id: uuid } });
        if (existing) {
          errors.push(`tenant ${legacyId} already exists`);
          continue;
        }

        await tx.tenant.create({
          data: {
            id: uuid,
            publicId,
            name,
            displayName: String(row.displayName ?? name),
            slug,
            status: TenantStatus.ACTIVE,
          },
        });
        byType.tenant = (byType.tenant ?? 0) + 1;
        imported += 1;
        this.auditEntity(params, 'tenant', uuid, legacyId);
      }

      for (const row of params.payload.data.queue ?? []) {
        const legacyId = String(row.legacyId ?? row.id ?? '');
        const tenantLegacyId = String(row.tenantLegacyId ?? row.tenantId ?? '');
        const tenantUuid =
          params.payload.mappings?.tenants?.[tenantLegacyId] ??
          (params.payload.data.tenant ?? []).find(
            (t) => String(t.legacyId ?? t.id) === tenantLegacyId,
          )?.platformUuid;
        if (!tenantUuid || typeof tenantUuid !== 'string') {
          errors.push(`queue ${legacyId} missing tenant mapping`);
          continue;
        }
        const id = randomUUID();
        const code = String(row.code ?? row.name ?? legacyId).replace(/\W+/g, '').slice(0, 32);
        await tx.queue.create({
          data: {
            id,
            publicId: `q-${code}`,
            tenantId: tenantUuid,
            name: String(row.name ?? code),
            code,
            status: QueueStatus.ACTIVE,
          },
        });
        byType.queue = (byType.queue ?? 0) + 1;
        imported += 1;
        this.auditEntity(params, 'queue', id, legacyId);
      }
    });

    this.logger.log(
      JSON.stringify({
        event: 'migration.production_import.complete',
        imported,
        byType,
        errors: errors.length,
      }),
    );

    return { imported, byType, errors };
  }

  private auditEntity(
    params: { actorUserId: string; tenantId?: string },
    entityType: string,
    entityId: string,
    legacyId: string,
  ): void {
    this.audit.adminAction({
      tenantId: params.tenantId,
      userId: params.actorUserId,
      action: 'migration.production_import.entity',
      resourceType: entityType,
      resourceId: entityId,
      detail: { legacyId, entityType },
    });
  }
}
