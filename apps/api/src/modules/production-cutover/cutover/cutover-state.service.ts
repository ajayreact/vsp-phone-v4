import { Injectable } from '@nestjs/common';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { CUTOVER_REDIS_KEYS } from '../types/cutover.types';

export type CutoverLifecycleState =
  | 'idle'
  | 'preparing'
  | 'in_progress'
  | 'smoke_testing'
  | 'completed'
  | 'rollback_planned';

/** Phase 20 — cutover lifecycle state in Redis. */
@Injectable()
export class CutoverStateService {
  constructor(private readonly redis: TelecomRedisService) {}

  async getState(): Promise<CutoverLifecycleState> {
    const raw = await this.redis.get(CUTOVER_REDIS_KEYS.state);
    if (!raw) return 'idle';
    try {
      const parsed = JSON.parse(raw) as { state: CutoverLifecycleState };
      return parsed.state ?? 'idle';
    } catch {
      return 'idle';
    }
  }

  async setState(state: CutoverLifecycleState, detail?: Record<string, unknown>): Promise<void> {
    await this.redis.setex(
      CUTOVER_REDIS_KEYS.state,
      86400 * 30,
      JSON.stringify({ state, ts: new Date().toISOString(), ...detail }),
    );
  }
}
