import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../telecom/redis/telecom-redis.service';
import { TelnyxCarrierAdapter } from './telnyx.carrier-adapter';
import type {
  CarrierDidLookup,
  NormalizedCarrierEvent,
  OutboundTrunkRequest,
  TrunkHint,
} from './carrier-adapter.interface';

export const CARRIER_EVENTS = {
  WEBHOOK: 'carrier.webhook.normalized',
  HEALTH: 'carrier.health',
  FAILOVER: 'carrier.failover.selected',
} as const;

/**
 * Carrier service — trunk selection, DID lookup, webhook corr enrichment.
 */
@Injectable()
export class CarrierService {
  private readonly logger = new Logger(CarrierService.name);

  constructor(
    private readonly adapter: TelnyxCarrierAdapter,
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
    private readonly events: EventEmitter2,
  ) {}

  selectOutboundTrunk(req: OutboundTrunkRequest): Promise<TrunkHint | null> {
    return this.adapter.selectOutboundTrunk(req);
  }

  selectFailoverTrunk(req: OutboundTrunkRequest, failed: TrunkHint): Promise<TrunkHint | null> {
    return this.adapter.selectFailoverTrunk(req, failed).then(async (next) => {
      if (next) {
        this.events.emit(CARRIER_EVENTS.FAILOVER, {
          eventId: randomUUID(),
          from: failed.carrierCode,
          to: next.carrierCode,
          tenantId: req.tenantId,
          ts: new Date().toISOString(),
        });
      }
      return next;
    });
  }

  async health(tenantId?: string) {
    const summary = await this.adapter.healthcheckSummary(tenantId);
    this.events.emit(CARRIER_EVENTS.HEALTH, summary);
    return summary;
  }

  /** Resolve inbound DID → PhoneNumber → Line (ADR-021). */
  async lookupDid(dnis: string, tenantHint?: string): Promise<CarrierDidLookup | null> {
    if (!this.prisma.connected) return null;
    const e164 = normalizeE164(dnis);
    if (!e164) return null;

    const pn = await this.prisma.phoneNumber.findFirst({
      where: {
        deletedAt: null,
        number: e164,
        ...(tenantHint ? { tenantId: tenantHint } : {}),
      },
      include: { carrier: true },
    });
    if (!pn) return null;

    return {
      e164: pn.number,
      phoneNumberId: pn.id,
      tenantId: pn.tenantId,
      lineId: pn.lineId ?? undefined,
      carrierId: pn.carrierId ?? undefined,
      carrierCode: pn.carrier?.code,
    };
  }

  /** Validate outbound CLI against tenant-owned PhoneNumber. */
  async validateCli(tenantId: string, cli: string | undefined): Promise<{
    ok: boolean;
    phoneNumberId?: string;
    number?: string;
    reason?: string;
  }> {
    if (!cli) return { ok: false, reason: 'CLI_REQUIRED' };
    const e164 = normalizeE164(cli);
    if (!e164) return { ok: false, reason: 'CLI_INVALID' };
    if (!this.prisma.connected) return { ok: false, reason: 'PRISMA_DOWN' };

    const pn = await this.prisma.phoneNumber.findFirst({
      where: { tenantId, deletedAt: null, number: e164 },
    });
    if (!pn) return { ok: false, reason: 'CLI_NOT_OWNED' };
    return { ok: true, phoneNumberId: pn.id, number: pn.number };
  }

  async handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): Promise<{ accepted: boolean; event?: NormalizedCarrierEvent }> {
    const normalized = await this.adapter.normalizeWebhook(headers, body);
    if (!normalized) {
      return { accepted: false };
    }

    // Enrich with platformUuid / tenant from Redis if telnyx call id known
    if (normalized.telnyxCallId) {
      // scan-friendly: try common tenant keys via reverse map if we stored it
      const stored = await this.redis.get(
        this.redis.corrTelnyxCallKeyLookup(normalized.telnyxCallId),
      );
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as {
            platformUuid?: string;
            tenantId?: string;
          };
          normalized.platformUuid = parsed.platformUuid;
          normalized.tenantId = parsed.tenantId;
        } catch {
          /* ignore */
        }
      }
    }

    this.events.emit(CARRIER_EVENTS.WEBHOOK, normalized);
    this.logger.log(
      JSON.stringify({
        event: 'carrier.webhook.accepted',
        type: normalized.type,
        eventId: normalized.eventId,
        telnyxCallId: normalized.telnyxCallId,
        platformUuid: normalized.platformUuid,
      }),
    );

    return { accepted: true, event: normalized };
  }

  /** Persist Telnyx ↔ platformUuid mapping (telecom Redis only). */
  async bindTelnyxCall(
    tenantId: string,
    platformUuid: string,
    telnyxCallId: string,
    carrierCode: string,
  ): Promise<void> {
    const ttl = 2 * 60 * 60;
    await this.redis.setex(
      this.redis.corrTelnyxCallKey(tenantId, telnyxCallId),
      ttl,
      JSON.stringify({ platformUuid, tenantId, carrierCode }),
    );
    await this.redis.setex(
      this.redis.corrTelnyxCallKeyLookup(telnyxCallId),
      ttl,
      JSON.stringify({ platformUuid, tenantId, carrierCode }),
    );
    const platKey = this.redis.corrPlatformKey(tenantId, platformUuid);
    const existing = await this.redis.get(platKey);
    let merged: Record<string, unknown> = { sipCallIds: [], callSessionId: undefined };
    if (existing) {
      try {
        merged = JSON.parse(existing) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }
    merged.telnyxCallId = telnyxCallId;
    merged.carrierCode = carrierCode;
    await this.redis.setex(platKey, ttl, JSON.stringify(merged));
  }
}

export function normalizeE164(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  if (/^\d{10,15}$/.test(digits)) return `+${digits}`;
  // sip:+15551234567@... or tel:+1555
  const m = input.match(/(?:\+|00)?(\d{8,15})/);
  if (m) return `+${m[1].replace(/^00/, '')}`;
  return null;
}
