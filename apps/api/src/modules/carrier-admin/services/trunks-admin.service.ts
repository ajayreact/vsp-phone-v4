import { Injectable } from '@nestjs/common';
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
};

@Injectable()
export class TrunksAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SipTrunkRecord[]> {
    if (!this.prisma.connected) return [];

    const carriers = await this.prisma.carrier.findMany({
      where: { deletedAt: null, carrierType: CarrierType.TELNYX, status: CarrierStatus.ACTIVE },
      orderBy: { name: 'asc' },
    });

    const results: SipTrunkRecord[] = [];
    for (const c of carriers) {
      const cfg = (c.configuration ?? {}) as TelnyxCarrierConfig & Record<string, unknown>;
      const metrics = (cfg.metrics ?? {}) as Record<string, number | string | null>;
      const health = cfg.health ?? 'GREEN';
      const activeCalls = await this.prisma.callSession.count({
        where: {
          tenantId: c.tenantId,
          deletedAt: null,
          state: {
            in: [
              CallLifecycleState.DIALING,
              CallLifecycleState.RINGING,
              CallLifecycleState.ANSWERED,
              CallLifecycleState.ACTIVE,
              CallLifecycleState.HOLD,
            ],
          },
        },
      });

      const healthMap = { GREEN: 'up', YELLOW: 'degraded', RED: 'down' } as const;
      results.push({
        id: c.id,
        name: c.name,
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
      });
    }
    return results;
  }
}
