import { Injectable, Logger } from '@nestjs/common';
import { CarrierStatus, CarrierType, CallLifecycleState } from '@prisma/client';
import type { TelnyxCarrierConfig } from '../../carrier/telnyx.carrier-adapter';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type SipTrunkRecord = {
  id: string;
  name: string;
  carrier: string;
  sipHost: string;
  registration: 'registered' | 'unregistered' | 'failed';
  latencyMs: number;
  packetLossPct: number;
  channelsTotal: number;
  channelsInUse: number;
  peakCallsToday: number;
  optionsPingMs: number | null;
  lastFailureAt: string | null;
  failoverEnabled: boolean;
  health: 'up' | 'down' | 'degraded';
  lastRegistrationAt: string | null;
  lastOptionsAt: string | null;
  concurrentCalls: number;
  metricsAvailable: boolean;
};

const ACTIVE_CALL_STATES: CallLifecycleState[] = [
  CallLifecycleState.DIALING,
  CallLifecycleState.RINGING,
  CallLifecycleState.ANSWERED,
  CallLifecycleState.ACTIVE,
  CallLifecycleState.HOLD,
];

@Injectable()
export class TrunksAdminService {
  private readonly logger = new Logger(TrunksAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SipTrunkRecord[]> {
    if (!this.prisma.connected) return [];

    try {
      const carriers = await this.prisma.carrier.findMany({
        where: { deletedAt: null, carrierType: CarrierType.TELNYX, status: CarrierStatus.ACTIVE },
        orderBy: [{ tenantId: 'asc' }, { createdAt: 'asc' }],
      });

      // Prefer platform-scoped Telnyx (tenantId NULL); fall back to oldest active row.
      const platform = carriers.find((c) => c.tenantId == null);
      const selected = platform ? [platform] : carriers.slice(0, 1);

      const results: SipTrunkRecord[] = [];
      for (const c of selected) {
        results.push(await this.toTrunkRecord(c));
      }
      return results;
    } catch (err) {
      this.logger.error(
        `SIP trunks list failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Never surface HTML / unhandled 500 for metrics — empty list with structured success.
      return [];
    }
  }

  private async toTrunkRecord(c: {
    id: string;
    name: string;
    carrierType: CarrierType;
    tenantId: string | null;
    configuration: unknown;
  }): Promise<SipTrunkRecord> {
    const cfg = (c.configuration ?? {}) as TelnyxCarrierConfig & Record<string, unknown>;
    const metrics = (cfg.metrics ?? {}) as Record<string, number | string | null>;
    const health = cfg.health ?? 'GREEN';
    const healthMap = { GREEN: 'up', YELLOW: 'degraded', RED: 'down' } as const;

    let activeCalls = 0;
    let metricsAvailable = true;
    try {
      activeCalls = await this.countActiveCalls(c.tenantId);
    } catch (err) {
      metricsAvailable = false;
      this.logger.warn(
        `SIP trunk call metrics unavailable for carrier ${c.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const hasMetricSamples =
      metrics.latencyMs != null ||
      metrics.optionsPingMs != null ||
      metrics.packetLossPct != null ||
      metrics.lastRegistrationAt != null;

    return {
      id: c.id,
      name: c.name || 'Telnyx SIP Trunk',
      carrier: c.carrierType,
      sipHost: cfg.sipHost ?? 'sip.telnyx.com',
      registration: health === 'RED' ? 'failed' : health === 'YELLOW' ? 'unregistered' : 'registered',
      latencyMs: Number(metrics.latencyMs ?? metrics.optionsPingMs ?? 0),
      packetLossPct: Number(metrics.packetLossPct ?? 0),
      channelsTotal: Number(metrics.channelsTotal ?? cfg.channelLimit ?? 100),
      channelsInUse: activeCalls,
      peakCallsToday: Number(metrics.peakCallsToday ?? activeCalls),
      optionsPingMs: metrics.optionsPingMs != null ? Number(metrics.optionsPingMs) : null,
      lastFailureAt: (metrics.lastFailureAt as string | null) ?? null,
      failoverEnabled: Boolean(cfg.failoverEnabled ?? true),
      health: healthMap[health as keyof typeof healthMap] ?? 'degraded',
      lastRegistrationAt: (metrics.lastRegistrationAt as string | null) ?? null,
      lastOptionsAt: (metrics.lastOptionsAt as string | null) ?? null,
      concurrentCalls: activeCalls,
      metricsAvailable: metricsAvailable && (hasMetricSamples || activeCalls >= 0),
    };
  }

  /**
   * Platform Telnyx carriers have tenantId NULL after Global Inventory.
   * Prisma rejects `where: { tenantId: null }` on required CallSession.tenantId —
   * count platform-wide concurrent calls instead.
   */
  private async countActiveCalls(tenantId: string | null): Promise<number> {
    return this.prisma.callSession.count({
      where: {
        deletedAt: null,
        state: { in: ACTIVE_CALL_STATES },
        ...(tenantId ? { tenantId } : {}),
      },
    });
  }
}
