import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import type { AuditEntry } from '../logging/logging.types';

const AUDIT_MAX_LEN = 5000;

/** Phase 15 — immutable audit log (append-only Redis stream; no Prisma). */
@Injectable()
export class EnterpriseAuditService {
  private readonly logger = new Logger(EnterpriseAuditService.name);

  constructor(private readonly redis: TelecomRedisService) {}

  /** Append-only — entries are never updated or deleted via this API. */
  async append(
    entry: Omit<AuditEntry, 'auditId' | 'ts' | 'immutable'>,
  ): Promise<AuditEntry> {
    const record: AuditEntry = {
      auditId: randomUUID(),
      ts: new Date().toISOString(),
      immutable: true,
      ...entry,
    };

    setImmediate(() => {
      void this.persist(record);
    });

    return record;
  }

  async query(params: {
    tenantId: string;
    limit?: number;
    actionPrefix?: string;
  }): Promise<AuditEntry[]> {
    const limit = Math.min(params.limit ?? 50, 200);
    const key = this.redis.auditStreamKey(params.tenantId);
    const raw = await this.redis.lrange(key, 0, limit - 1);
    const entries: AuditEntry[] = [];
    for (const line of raw) {
      try {
        const e = JSON.parse(line) as AuditEntry;
        if (params.actionPrefix && !e.action.startsWith(params.actionPrefix)) continue;
        entries.push(e);
      } catch {
        /* skip */
      }
    }
    return entries;
  }

  private async persist(record: AuditEntry): Promise<void> {
    const key = this.redis.auditStreamKey(record.tenantId);
    await this.redis.lpushUnbounded(key, JSON.stringify(record));
    await this.redis.ltrim(key, 0, AUDIT_MAX_LEN - 1);
    this.logger.log(JSON.stringify({ event: 'audit.appended', auditId: record.auditId, action: record.action }));
  }
}
