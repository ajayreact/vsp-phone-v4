import { Injectable } from '@nestjs/common';

/** Phase 12 foundation — subscription channel registry (WebSocket push deferred). */
@Injectable()
export class PresenceSubscriptionService {
  subscriptionChannel(tenantId: string, lineId: string): string {
    return `vsp:${tenantId}:presence:sub:${lineId}`;
  }

  listFoundationChannels(tenantId: string): string[] {
    return [`vsp:${tenantId}:presence:*`];
  }
}
