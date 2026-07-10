import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type NumberNotificationRecord = {
  id: string;
  tenantId: string;
  userId: string | null;
  type: string;
  title: string;
  body: string;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

@Injectable()
export class NumberNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(
    tenantId: string,
    payload: {
      userId?: string;
      type: string;
      title: string;
      body: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<NumberNotificationRecord> {
    if (!this.prisma.connected) {
      return {
        id: randomUUID(),
        tenantId,
        userId: payload.userId ?? null,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        read: false,
        metadata: payload.metadata ?? null,
        createdAt: new Date().toISOString(),
      };
    }

    const row = await this.prisma.numberNotification.create({
      data: {
        id: randomUUID(),
        tenantId,
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        metadata: (payload.metadata ?? undefined) as object | undefined,
      },
    });

    return this.toRecord(row);
  }

  async list(tenantId: string, userId?: string, unreadOnly = false): Promise<NumberNotificationRecord[]> {
    if (!this.prisma.connected) return [];

    const rows = await this.prisma.numberNotification.findMany({
      where: {
        tenantId,
        ...(unreadOnly ? { read: false } : {}),
        ...(userId ? { OR: [{ userId }, { userId: null }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return rows.map((r) => this.toRecord(r));
  }

  async markRead(tenantId: string, id: string): Promise<NumberNotificationRecord> {
    const row = await this.prisma.numberNotification.update({
      where: { id },
      data: { read: true },
    });
    if (row.tenantId !== tenantId) throw new Error('Notification not found');
    return this.toRecord(row);
  }

  async markAllRead(tenantId: string, userId?: string): Promise<number> {
    const result = await this.prisma.numberNotification.updateMany({
      where: {
        tenantId,
        read: false,
        ...(userId ? { OR: [{ userId }, { userId: null }] } : {}),
      },
      data: { read: true },
    });
    return result.count;
  }

  private toRecord(row: {
    id: string;
    tenantId: string;
    userId: string | null;
    type: string;
    title: string;
    body: string;
    read: boolean;
    metadata: unknown;
    createdAt: Date;
  }): NumberNotificationRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      type: row.type,
      title: row.title,
      body: row.body,
      read: row.read,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
