import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type PlatformSettingsRecord = {
  id: string;
  platformName: string;
  supportEmail: string;
  defaultTimezone: string;
  /** @deprecated Always null — Global Inventory uses PhoneNumber.ownerTenantId NULL. */
  inventoryTenantId: string | null;
  stripeEnabled: boolean;
  developerMode: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpFromEmail: string | null;
  smtpUseTls: boolean;
  smtpConfigured: boolean;
  updatedAt: string;
};

export type UpdatePlatformSettingsDto = {
  platformName?: string;
  supportEmail?: string;
  defaultTimezone?: string;
  /** @deprecated Ignored — inventory tenant removed. */
  inventoryTenantId?: string | null;
  developerMode?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUsername?: string | null;
  smtpFromEmail?: string | null;
  smtpUseTls?: boolean;
};

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<PlatformSettingsRecord> {
    const row = await this.ensureRow();
    return this.toRecord(row);
  }

  async update(dto: UpdatePlatformSettingsDto): Promise<PlatformSettingsRecord> {
    const row = await this.ensureRow();
    const smtpConfigured = Boolean(
      (dto.smtpHost ?? row.smtpHost) && (dto.smtpFromEmail ?? row.smtpFromEmail),
    );
    const updated = await this.prisma.platformSettings.update({
      where: { id: row.id },
      data: {
        ...(dto.platformName !== undefined ? { platformName: dto.platformName.trim() } : {}),
        ...(dto.supportEmail !== undefined ? { supportEmail: dto.supportEmail.trim() } : {}),
        ...(dto.defaultTimezone !== undefined ? { defaultTimezone: dto.defaultTimezone.trim() } : {}),
        // Force-clear legacy inventory tenant pointer (Global Inventory = ownerTenantId NULL).
        inventoryTenantId: null,
        ...(dto.developerMode !== undefined ? { developerMode: dto.developerMode } : {}),
        ...(dto.smtpHost !== undefined ? { smtpHost: dto.smtpHost?.trim() || null } : {}),
        ...(dto.smtpPort !== undefined ? { smtpPort: dto.smtpPort } : {}),
        ...(dto.smtpUsername !== undefined ? { smtpUsername: dto.smtpUsername?.trim() || null } : {}),
        ...(dto.smtpFromEmail !== undefined ? { smtpFromEmail: dto.smtpFromEmail?.trim() || null } : {}),
        ...(dto.smtpUseTls !== undefined ? { smtpUseTls: dto.smtpUseTls } : {}),
        smtpConfigured,
      },
    });
    return this.toRecord(updated);
  }

  private async ensureRow() {
    if (!this.prisma.connected) {
      throw new Error('Database unavailable');
    }
    const existing = await this.prisma.platformSettings.findFirst();
    if (existing) return existing;
    return this.prisma.platformSettings.create({
      data: {
        id: randomUUID(),
        platformName: 'VSP Phone',
        supportEmail: 'support@vspphone.com',
        defaultTimezone: 'America/New_York',
      },
    });
  }

  private toRecord(row: {
    id: string;
    platformName: string;
    supportEmail: string;
    defaultTimezone: string;
    inventoryTenantId: string | null;
    stripeEnabled: boolean;
    developerMode: boolean;
    smtpHost: string | null;
    smtpPort: number | null;
    smtpUsername: string | null;
    smtpFromEmail: string | null;
    smtpUseTls: boolean;
    smtpConfigured: boolean;
    updatedAt: Date;
  }): PlatformSettingsRecord {
    return {
      id: row.id,
      platformName: row.platformName,
      supportEmail: row.supportEmail,
      defaultTimezone: row.defaultTimezone,
      inventoryTenantId: null,
      stripeEnabled: row.stripeEnabled,
      developerMode: row.developerMode,
      smtpHost: row.smtpHost,
      smtpPort: row.smtpPort,
      smtpUsername: row.smtpUsername,
      smtpFromEmail: row.smtpFromEmail,
      smtpUseTls: row.smtpUseTls,
      smtpConfigured: row.smtpConfigured,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
