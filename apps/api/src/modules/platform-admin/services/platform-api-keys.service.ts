import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiKeyStatus } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type ApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  status: ApiKeyStatus;
  scopes: string[];
  tenantId: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type CreateApiKeyDto = {
  name: string;
  tenantId?: string;
  scopes?: string[];
  expiresAt?: string;
};

@Injectable()
export class PlatformApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId?: string): Promise<ApiKeyRecord[]> {
    if (!this.prisma.connected) return [];
    const rows = await this.prisma.apiKey.findMany({
      where: {
        status: ApiKeyStatus.ACTIVE,
        ...(tenantId !== undefined ? { tenantId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toRecord(r));
  }

  async create(dto: CreateApiKeyDto, createdBy?: string): Promise<ApiKeyRecord & { secret: string }> {
    if (!this.prisma.connected) throw new ConflictException('Database unavailable');

    const secret = `vsp_${randomBytes(24).toString('base64url')}`;
    const keyPrefix = secret.slice(0, 12);
    const keyHash = createHash('sha256').update(secret).digest('hex');

    const row = await this.prisma.apiKey.create({
      data: {
        id: randomUUID(),
        name: dto.name.trim(),
        keyPrefix,
        keyHash,
        tenantId: dto.tenantId ?? null,
        scopes: dto.scopes ?? ['platform:read'],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdBy: createdBy ?? null,
      },
    });

    return { ...this.toRecord(row), secret };
  }

  async revoke(id: string): Promise<ApiKeyRecord> {
    const row = await this.prisma.apiKey.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('API key not found');
    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { status: ApiKeyStatus.REVOKED },
    });
    return this.toRecord(updated);
  }

  private toRecord(row: {
    id: string;
    name: string;
    keyPrefix: string;
    status: ApiKeyStatus;
    scopes: string[];
    tenantId: string | null;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
  }): ApiKeyRecord {
    return {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      status: row.status,
      scopes: row.scopes,
      tenantId: row.tenantId,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
