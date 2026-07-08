import { Injectable } from '@nestjs/common';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { RunbookCatalogService } from '../runbooks/runbook-catalog.service';
import type {
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistState,
  CutoverPhase,
} from '../types/cutover.types';
import { CUTOVER_REDIS_KEYS } from '../types/cutover.types';

/** Phase 20 — configurable operational checklist engine. */
@Injectable()
export class ChecklistEngineService {
  constructor(
    private readonly redis: TelecomRedisService,
    private readonly catalog: RunbookCatalogService,
  ) {}

  async getChecklist(phase: CutoverPhase): Promise<ChecklistState> {
    const raw = await this.redis.get(CUTOVER_REDIS_KEYS.checklist(phase));
    if (raw) {
      try {
        return JSON.parse(raw) as ChecklistState;
      } catch {
        /* fall through */
      }
    }
    return {
      phase,
      items: this.catalog.getTemplate(phase),
      updatedAt: new Date().toISOString(),
    };
  }

  async updateItem(
    phase: CutoverPhase,
    itemId: string,
    update: { status?: ChecklistItemStatus; owner?: string; notes?: string },
  ): Promise<ChecklistState> {
    const checklist = await this.getChecklist(phase);
    const item = checklist.items.find((i) => i.id === itemId);
    if (!item) return checklist;

    if (update.status) item.status = update.status;
    if (update.owner !== undefined) item.owner = update.owner;
    if (update.notes !== undefined) item.notes = update.notes;
    item.timestamp = new Date().toISOString();

    checklist.updatedAt = new Date().toISOString();
    await this.redis.setex(
      CUTOVER_REDIS_KEYS.checklist(phase),
      86400 * 30,
      JSON.stringify(checklist),
    );
    return checklist;
  }

  async getAllChecklists(): Promise<Record<CutoverPhase, ChecklistState>> {
    const phases = this.catalog.getAllPhases();
    const out = {} as Record<CutoverPhase, ChecklistState>;
    for (const phase of phases) {
      out[phase] = await this.getChecklist(phase);
    }
    return out;
  }

  completionSummary(checklists: Record<CutoverPhase, ChecklistState>): {
    total: number;
    completed: number;
    pending: number;
  } {
    let total = 0;
    let completed = 0;
    for (const cl of Object.values(checklists)) {
      for (const item of cl.items) {
        total++;
        if (item.status === 'completed') completed++;
      }
    }
    return { total, completed, pending: total - completed };
  }
}
