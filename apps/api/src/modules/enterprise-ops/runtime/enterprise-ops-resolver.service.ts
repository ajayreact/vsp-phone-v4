import { Injectable } from '@nestjs/common';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import type { HuntStrategy } from '../events/ring-hunt.events';

export type EnterpriseOpsTarget =
  | { kind: 'PARK_RETRIEVE'; slot: string; tenantId: string }
  | { kind: 'PICKUP'; mode: 'directed' | 'group'; tenantId: string; targetExt?: string; groupId?: string }
  | { kind: 'RING_GROUP'; tenantId: string; code: string; lineIds: string[] }
  | { kind: 'HUNT_GROUP'; tenantId: string; code: string; lineIds: string[]; strategy: HuntStrategy }
  | { kind: 'PAGING'; tenantId: string; code: string; lineIds: string[] }
  | { kind: 'INTERCOM'; tenantId: string; code: string; targetLineId: string; mode: 'one-way' | 'two-way' };

/** Phase 14 — resolve feature codes from Redis runtime registry (no Prisma). */
@Injectable()
export class EnterpriseOpsResolverService {
  constructor(private readonly redis: TelecomRedisService) {}

  async resolveByCode(code: string, tenantId?: string): Promise<EnterpriseOpsTarget | null> {
    const normalized = code.trim();
    if (!normalized || !tenantId) return null;

    if (/^70\d{1,3}$/.test(normalized)) {
      return { kind: 'PARK_RETRIEVE', slot: normalized.slice(2), tenantId };
    }
    if (normalized.startsWith('*8') && normalized.length > 2) {
      return {
        kind: 'PICKUP',
        mode: 'directed',
        tenantId,
        targetExt: normalized.slice(2),
      };
    }
    if (normalized === '*881' || normalized === '*88') {
      return { kind: 'PICKUP', mode: 'group', tenantId, groupId: 'default' };
    }

    const raw = await this.redis.get(this.redis.opsFeatureKey(tenantId, normalized));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as EnterpriseOpsTarget & { kind: string };
      if (parsed.tenantId && parsed.tenantId !== tenantId) return null;
      return { ...parsed, tenantId };
    } catch {
      return null;
    }
  }

  async getSlaAppearanceLineIds(tenantId: string, sharedLineId: string): Promise<string[]> {
    const raw = await this.redis.get(this.redis.slaGroupKey(tenantId, sharedLineId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as { appearanceLineIds?: string[] };
      return parsed.appearanceLineIds ?? [];
    } catch {
      return [];
    }
  }
}
