import { Injectable } from '@nestjs/common';
import type { RouteResponseDto } from '../../telecom/dto/telecom.response.dto';
import type { TelecomCallMeta } from '../../telecom/telecom.service.interface';
import { EnterpriseOpsResolverService } from './enterprise-ops-resolver.service';
import { ParkRuntimeService } from './park-runtime.service';
import { PickupRuntimeService } from './pickup-runtime.service';
import { RingGroupService } from './ring-group.service';
import { HuntGroupService } from './hunt-group.service';
import { PagingRuntimeService } from './paging-runtime.service';
import { IntercomRuntimeService } from './intercom-runtime.service';
import { SlaAppearanceService } from './sla-appearance.service';
import type { RouteActionDto } from '../../telecom/dto/telecom.response.dto';

/** Phase 14 — orchestrate enterprise ops feature resolution. */
@Injectable()
export class EnterpriseOpsRoutingService {
  constructor(
    private readonly resolver: EnterpriseOpsResolverService,
    private readonly park: ParkRuntimeService,
    private readonly pickup: PickupRuntimeService,
    private readonly ringGroup: RingGroupService,
    private readonly huntGroup: HuntGroupService,
    private readonly paging: PagingRuntimeService,
    private readonly intercom: IntercomRuntimeService,
    private readonly sla: SlaAppearanceService,
  ) {}

  async resolveFeature(params: {
    code: string;
    tenantId?: string;
    fromLineId?: string;
    platformUuid?: string;
    meta: TelecomCallMeta;
  }): Promise<RouteResponseDto | null> {
    if (!params.tenantId) return null;
    const target = await this.resolver.resolveByCode(params.code, params.tenantId);
    if (!target) return null;

    switch (target.kind) {
      case 'PARK_RETRIEVE': {
        return this.park.retrieve({
          tenantId: target.tenantId,
          slot: target.slot,
          retrieverLineId: params.fromLineId,
          meta: params.meta,
        });
      }
      case 'PICKUP': {
        if (target.mode === 'directed' && target.targetExt) {
          return this.pickup.directedPickup({
            tenantId: target.tenantId,
            targetExt: target.targetExt,
            pickerLineId: params.fromLineId,
            meta: params.meta,
          });
        }
        return this.pickup.groupPickup({
          tenantId: target.tenantId,
          groupId: target.groupId,
          pickerLineId: params.fromLineId,
          meta: params.meta,
        });
      }
      case 'RING_GROUP': {
        const result = await this.ringGroup.offer({
          tenantId: target.tenantId,
          code: target.code,
          lineIds: target.lineIds,
          fromLineId: params.fromLineId,
          platformUuid: params.platformUuid,
          meta: params.meta,
        });
        return result.plan;
      }
      case 'HUNT_GROUP': {
        const result = await this.huntGroup.offer({
          tenantId: target.tenantId,
          code: target.code,
          lineIds: target.lineIds,
          strategy: target.strategy,
          fromLineId: params.fromLineId,
          platformUuid: params.platformUuid,
          meta: params.meta,
        });
        return result.plan;
      }
      case 'PAGING': {
        const result = await this.paging.page({
          tenantId: target.tenantId,
          code: target.code,
          lineIds: target.lineIds,
          fromLineId: params.fromLineId,
          platformUuid: params.platformUuid,
          meta: params.meta,
        });
        return result.plan;
      }
      case 'INTERCOM': {
        const result = await this.intercom.intercom({
          tenantId: target.tenantId,
          code: target.code,
          targetLineId: target.targetLineId,
          mode: target.mode,
          fromLineId: params.fromLineId,
          platformUuid: params.platformUuid,
          meta: params.meta,
        });
        return result.plan;
      }
      default:
        return null;
    }
  }

  async expandSlaFork(params: {
    tenantId: string;
    primaryLineId: string;
    existingActions: RouteActionDto[];
  }): Promise<RouteActionDto[]> {
    return this.sla.expandSlaFork(params);
  }
}
