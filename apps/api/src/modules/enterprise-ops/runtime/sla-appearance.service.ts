import { Injectable } from '@nestjs/common';
import type { RouteActionDto } from '../../telecom/dto/telecom.response.dto';
import { EnterpriseOpsResolverService } from './enterprise-ops-resolver.service';
import { LineForkService } from './line-fork.service';

/** Phase 14 — Shared Line Appearance: expand FORK to all appearance lines. */
@Injectable()
export class SlaAppearanceService {
  constructor(
    private readonly resolver: EnterpriseOpsResolverService,
    private readonly fork: LineForkService,
  ) {}

  async expandSlaFork(params: {
    tenantId: string;
    primaryLineId: string;
    existingActions: RouteActionDto[];
  }): Promise<RouteActionDto[]> {
    const appearanceLineIds = await this.resolver.getSlaAppearanceLineIds(
      params.tenantId,
      params.primaryLineId,
    );
    if (!appearanceLineIds.length) return params.existingActions;

    const allLineIds = [params.primaryLineId, ...appearanceLineIds.filter((id) => id !== params.primaryLineId)];
    const slaActions = await this.fork.buildForkActions({
      tenantId: params.tenantId,
      lineIds: allLineIds,
      strategy: 'FORK',
      hints: { 'Call-Info': 'appearance=shared' },
    });
    return slaActions.length ? slaActions : params.existingActions;
  }
}
