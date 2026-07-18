import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeviceType, Prisma, TenantStatus, UserStatus } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { EnterpriseAuditService } from '../../enterprise-observability/audit/enterprise-audit.service';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { newPublicId } from '../../tenant-portal/utils/tenant.util';
import { PlatformSettingsService } from './platform-settings.service';
import { isProtectedTenantSlug } from '../utils/tenant-lifecycle-confirm';

type Tx = Prisma.TransactionClient;

@Injectable()
export class TenantDevToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly audit: EnterpriseAuditService,
  ) {}

  private async assertDeveloperMode(): Promise<void> {
    const s = await this.settings.get();
    if (!s.developerMode) {
      throw new ForbiddenException('Developer Mode is disabled in Platform Settings');
    }
  }

  private async requireTenant(tenantId: string) {
    const row = await this.prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
    if (!row) throw new NotFoundException('Tenant not found');
    if (isProtectedTenantSlug(row.slug)) {
      throw new BadRequestException('Protected tenants cannot be used with developer tools');
    }
    if (row.status === TenantStatus.DELETED) {
      throw new BadRequestException('Tenant is deleted');
    }
    return row;
  }

  private async auditAction(
    tenantId: string,
    actorUserId: string,
    action: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.append({
      tenantId,
      actorUserId,
      actorType: 'admin',
      action,
      resourceType: 'tenant',
      resourceId: tenantId,
      detail,
    });
  }

  private async createDemoExtensions(
    tx: Tx,
    tenantId: string,
    actorUserId: string,
    count: number,
  ): Promise<{ count: number }> {
    const n = Math.min(Math.max(count, 1), 25);
    const existing = await tx.extension.findMany({
      where: { tenantId, deletedAt: null },
      select: { extension: true },
    });
    const used = new Set(existing.map((e) => e.extension));
    let start = 200;
    let created = 0;
    for (let i = 0; i < n; i += 1) {
      while (used.has(String(start))) start += 1;
      const ext = String(start);
      used.add(ext);
      start += 1;
      const lineId = randomUUID();
      await tx.line.create({
        data: {
          id: lineId,
          publicId: newPublicId('line'),
          tenantId,
          name: `[demo] Ext ${ext}`,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
      await tx.extension.create({
        data: {
          id: randomUUID(),
          tenantId,
          lineId,
          extension: ext,
          description: `[demo] ${ext}`,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
      created += 1;
    }
    return { count: created };
  }

  private async createDemoDevices(
    tx: Tx,
    tenantId: string,
    actorUserId: string,
    count: number,
  ): Promise<{ count: number }> {
    const n = Math.min(Math.max(count, 1), 25);
    const lines = await tx.line.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true },
      take: n,
    });
    let created = 0;
    for (let i = 0; i < n; i += 1) {
      await tx.device.create({
        data: {
          id: randomUUID(),
          publicId: newPublicId('dev'),
          tenantId,
          lineId: lines[i % Math.max(lines.length, 1)]?.id ?? null,
          name: `[demo] Device ${i + 1}`,
          deviceType: DeviceType.DESK_PHONE,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
      created += 1;
    }
    return { count: created };
  }

  private async createDemoUsers(
    tx: Tx,
    tenantId: string,
    actorUserId: string,
    count: number,
  ): Promise<{ count: number }> {
    const n = Math.min(Math.max(count, 1), 25);
    const stamp = Date.now();
    let created = 0;
    for (let i = 0; i < n; i += 1) {
      const userId = randomUUID();
      const email = `demo.user.${stamp}.${i + 1}@example.invalid`;
      const passwordHash = createHash('sha256')
        .update(`demo-${randomBytes(8).toString('hex')}`)
        .digest('hex');
      await tx.user.create({
        data: {
          id: userId,
          publicId: newPublicId('user'),
          tenantId,
          email,
          username: `demo_user_${stamp}_${i + 1}`,
          passwordHash,
          status: UserStatus.ACTIVE,
          createdBy: actorUserId,
          updatedBy: actorUserId,
          profile: {
            create: {
              id: randomUUID(),
              tenantId,
              firstName: 'Demo',
              lastName: `User ${i + 1}`,
              displayName: `[demo] User ${i + 1}`,
              createdBy: actorUserId,
              updatedBy: actorUserId,
            },
          },
        },
      });
      created += 1;
    }
    return { count: created };
  }

  private async clearDemoInTx(tx: Tx, tenantId: string, actorUserId: string) {
    const now = new Date();
    const devices = await tx.device.updateMany({
      where: { tenantId, name: { startsWith: '[demo]' }, deletedAt: null },
      data: { deletedAt: now, deletedBy: actorUserId },
    });
    const extensions = await tx.extension.updateMany({
      where: { tenantId, description: { startsWith: '[demo]' }, deletedAt: null },
      data: { deletedAt: now, deletedBy: actorUserId },
    });
    const lines = await tx.line.updateMany({
      where: { tenantId, name: { startsWith: '[demo]' }, deletedAt: null },
      data: { deletedAt: now, deletedBy: actorUserId },
    });
    const users = await tx.user.updateMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { email: { startsWith: 'demo.user.' } },
          { username: { startsWith: 'demo_user_' } },
        ],
      },
      data: { deletedAt: now, deletedBy: actorUserId, status: UserStatus.INACTIVE },
    });
    return {
      devices: devices.count,
      extensions: extensions.count,
      lines: lines.count,
      users: users.count,
    };
  }

  async seedDemoData(tenantId: string, actorUserId: string) {
    await this.assertDeveloperMode();
    await this.requireTenant(tenantId);
    const result = await this.prisma.$transaction(
      async (tx) => {
        const extensions = await this.createDemoExtensions(tx, tenantId, actorUserId, 5);
        const devices = await this.createDemoDevices(tx, tenantId, actorUserId, 3);
        return { extensions: extensions.count, devices: devices.count };
      },
      { timeout: 60_000 },
    );
    await this.auditAction(tenantId, actorUserId, 'tenant.dev.seed_demo', result);
    return result;
  }

  async generateExtensions(tenantId: string, actorUserId: string, count = 5) {
    await this.assertDeveloperMode();
    await this.requireTenant(tenantId);
    const result = await this.prisma.$transaction(
      async (tx) => this.createDemoExtensions(tx, tenantId, actorUserId, count),
      { timeout: 60_000 },
    );
    await this.auditAction(tenantId, actorUserId, 'tenant.dev.generate_extensions', result);
    return result;
  }

  async generateDevices(tenantId: string, actorUserId: string, count = 3) {
    await this.assertDeveloperMode();
    await this.requireTenant(tenantId);
    const result = await this.prisma.$transaction(
      async (tx) => this.createDemoDevices(tx, tenantId, actorUserId, count),
      { timeout: 60_000 },
    );
    await this.auditAction(tenantId, actorUserId, 'tenant.dev.generate_devices', result);
    return result;
  }

  async generateUsers(tenantId: string, actorUserId: string, count = 3) {
    await this.assertDeveloperMode();
    await this.requireTenant(tenantId);
    const result = await this.prisma.$transaction(
      async (tx) => this.createDemoUsers(tx, tenantId, actorUserId, count),
      { timeout: 60_000 },
    );
    await this.auditAction(tenantId, actorUserId, 'tenant.dev.generate_users', result);
    return result;
  }

  async generateCallHistory(tenantId: string, actorUserId: string, count = 10) {
    await this.assertDeveloperMode();
    await this.requireTenant(tenantId);
    const result = await this.prisma.$transaction(async () => ({
      count: 0,
      note: 'Reserved — use Reset Tenant + live traffic for CDR in this pilot build',
      requested: count,
    }));
    await this.auditAction(tenantId, actorUserId, 'tenant.dev.generate_calls', {
      requested: count,
      created: 0,
      note: result.note,
    });
    return result;
  }

  async generateRecordings(tenantId: string, actorUserId: string, count = 5) {
    await this.assertDeveloperMode();
    await this.requireTenant(tenantId);
    const result = await this.prisma.$transaction(async () => ({
      count: 0,
      note: 'Reserved — recording generator ships with media store in a later build',
      requested: count,
    }));
    await this.auditAction(tenantId, actorUserId, 'tenant.dev.generate_recordings', {
      requested: count,
      created: 0,
    });
    return result;
  }

  async generateSipCredentials(tenantId: string, actorUserId: string) {
    await this.assertDeveloperMode();
    await this.requireTenant(tenantId);
    const result = await this.prisma.$transaction(async () => ({
      note: 'Use Extensions → Devices provisioning for SIP credentials',
    }));
    await this.auditAction(tenantId, actorUserId, 'tenant.dev.generate_sip', result);
    return result;
  }

  async clearDemoData(tenantId: string, actorUserId: string) {
    await this.assertDeveloperMode();
    await this.requireTenant(tenantId);
    const result = await this.prisma.$transaction(
      async (tx) => this.clearDemoInTx(tx, tenantId, actorUserId),
      { timeout: 60_000 },
    );
    await this.auditAction(tenantId, actorUserId, 'tenant.dev.clear_demo', result);
    return result;
  }

  async resetDemoData(tenantId: string, actorUserId: string) {
    await this.assertDeveloperMode();
    await this.requireTenant(tenantId);
    const result = await this.prisma.$transaction(
      async (tx) => {
        const cleared = await this.clearDemoInTx(tx, tenantId, actorUserId);
        const extensions = await this.createDemoExtensions(tx, tenantId, actorUserId, 5);
        const devices = await this.createDemoDevices(tx, tenantId, actorUserId, 3);
        return {
          cleared,
          extensions: extensions.count,
          devices: devices.count,
        };
      },
      { timeout: 60_000 },
    );
    await this.auditAction(tenantId, actorUserId, 'tenant.dev.reset_demo', result);
    return result;
  }
}
