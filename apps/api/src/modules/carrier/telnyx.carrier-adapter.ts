import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CarrierStatus, CarrierType } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../telecom/prisma/prisma.service';
import type {
  CarrierAdapter,
  CarrierHealthStatus,
  NormalizedCarrierEvent,
  OutboundTrunkRequest,
  TrunkHint,
} from './carrier-adapter.interface';

/** Opaque Carrier.configuration JSON shape (ADR-010 — no Prisma redesign). */
export interface TelnyxCarrierConfig {
  sipHost?: string;
  sipPort?: number;
  transport?: 'udp' | 'tcp' | 'tls';
  backupSipHost?: string;
  dispatcherSet?: number;
  connectionId?: string;
  outboundProfileId?: string;
  health?: CarrierHealthStatus;
  failoverEnabled?: boolean;
  apiBaseUrl?: string;
}

@Injectable()
export class TelnyxCarrierAdapter implements CarrierAdapter {
  readonly provider = 'TELNYX';
  private readonly logger = new Logger(TelnyxCarrierAdapter.name);
  private readonly defaultSipHost: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.defaultSipHost = config.get<string>('TELNYX_SIP_HOST', 'sip.telnyx.com');
    this.webhookSecret = (config.get<string>('TELNYX_WEBHOOK_SECRET') || '').trim();
  }

  async selectOutboundTrunk(req: OutboundTrunkRequest): Promise<TrunkHint | null> {
    if (!this.prisma.connected) return null;

    // Platform Telnyx (tenantId NULL) is shared; also allow tenant-scoped carriers if present.
    const carriers = await this.prisma.carrier.findMany({
      where: {
        deletedAt: null,
        status: CarrierStatus.ACTIVE,
        carrierType: CarrierType.TELNYX,
        OR: [{ tenantId: null }, { tenantId: req.tenantId }],
        ...(req.preferredCarrierCode ? { code: req.preferredCarrierCode } : {}),
      },
      orderBy: [{ tenantId: 'asc' }, { createdAt: 'asc' }],
    });

    for (const c of carriers) {
      const hint = this.toTrunkHint(c);
      if (hint.health === 'RED') continue;
      if (!this.isCarrierVisibleToTenant(hint.tenantId, req.tenantId)) continue;
      return hint;
    }
    return null;
  }

  async getHealth(tenantId: string, carrierCode?: string): Promise<CarrierHealthStatus> {
    if (!this.prisma.connected) return 'RED';
    const c = await this.prisma.carrier.findFirst({
      where: {
        deletedAt: null,
        carrierType: CarrierType.TELNYX,
        status: CarrierStatus.ACTIVE,
        OR: [{ tenantId: null }, { tenantId }],
        ...(carrierCode ? { code: carrierCode } : {}),
      },
      orderBy: [{ tenantId: 'asc' }, { createdAt: 'asc' }],
    });
    if (!c) return 'RED';
    return this.toTrunkHint(c).health;
  }

  async selectFailoverTrunk(
    req: OutboundTrunkRequest,
    failed: TrunkHint,
  ): Promise<TrunkHint | null> {
    if (!failed.failoverEnabled) return null;
    if (!this.prisma.connected) return null;

    if (failed.backupSipHost) {
      return { ...failed, sipHost: failed.backupSipHost, health: 'YELLOW' };
    }

    const carriers = await this.prisma.carrier.findMany({
      where: {
        deletedAt: null,
        status: CarrierStatus.ACTIVE,
        carrierType: CarrierType.TELNYX,
        OR: [{ tenantId: null }, { tenantId: req.tenantId }],
        NOT: { id: failed.carrierId },
      },
      orderBy: [{ tenantId: 'asc' }, { createdAt: 'asc' }],
    });

    for (const c of carriers) {
      const hint = this.toTrunkHint(c);
      if (hint.health === 'RED') continue;
      if (!this.isCarrierVisibleToTenant(hint.tenantId, req.tenantId)) continue;
      return hint;
    }

    return null;
  }

  async normalizeWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): Promise<NormalizedCarrierEvent | null> {
    if (!this.verifySignature(headers, body)) {
      this.logger.warn(JSON.stringify({ event: 'carrier.webhook.bad_signature' }));
      return null;
    }

    const obj = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const data = (obj.data && typeof obj.data === 'object' ? obj.data : obj) as Record<
      string,
      unknown
    >;
    const payload =
      data.payload && typeof data.payload === 'object'
        ? (data.payload as Record<string, unknown>)
        : data;

    const rawType = String(data.event_type ?? data.type ?? obj.event_type ?? 'unknown');
    const telnyxCallId = String(
      payload.call_control_id ?? payload.call_session_id ?? payload.call_leg_id ?? '',
    ).trim() || undefined;
    const e164 = String(
      payload.to ?? payload.destination_number ?? payload.to_number ?? '',
    ).trim() || undefined;
    const from = String(payload.from ?? payload.from_number ?? '').trim() || undefined;
    const status = String(payload.state ?? payload.hangup_cause ?? '').trim() || undefined;

    const type = this.mapEventType(rawType);

    return {
      eventId: String(data.id ?? obj.id ?? `telnyx_${Date.now()}`),
      provider: 'TELNYX',
      type,
      telnyxCallId,
      e164: e164 || from,
      status,
      rawType,
      receivedAt: new Date().toISOString(),
      payload: payload as Record<string, unknown>,
      platformUuid: undefined,
      tenantId: undefined,
    };
  }

  /** Lab/health probe — does not dial; reports configured trunk reachability posture. */
  async healthcheckSummary(tenantId?: string): Promise<{
    provider: string;
    status: CarrierHealthStatus;
    sipHost: string;
    carriers: number;
  }> {
    const host = this.defaultSipHost;
    if (!this.prisma.connected) {
      return { provider: this.provider, status: 'YELLOW', sipHost: host, carriers: 0 };
    }
    const where = {
      deletedAt: null as null,
      carrierType: CarrierType.TELNYX,
      status: CarrierStatus.ACTIVE,
      ...(tenantId ? { tenantId } : {}),
    };
    const list = await this.prisma.carrier.findMany({ where, take: 50 });
    if (!list.length) {
      return { provider: this.provider, status: 'YELLOW', sipHost: host, carriers: 0 };
    }
    const statuses = list.map((c) => this.toTrunkHint(c).health);
    const status: CarrierHealthStatus = statuses.every((s) => s === 'GREEN')
      ? 'GREEN'
      : statuses.some((s) => s === 'GREEN' || s === 'YELLOW')
        ? 'YELLOW'
        : 'RED';
    return { provider: this.provider, status, sipHost: host, carriers: list.length };
  }

  /** Platform carriers (tenantId NULL) are visible to every tenant; never cross-tenant. */
  private isCarrierVisibleToTenant(
    carrierTenantId: string | null,
    requestTenantId: string,
  ): boolean {
    return carrierTenantId == null || carrierTenantId === requestTenantId;
  }

  private toTrunkHint(c: {
    id: string;
    code: string;
    carrierType: CarrierType;
    tenantId: string | null;
    configuration: unknown;
  }): TrunkHint {
    const cfg = (c.configuration && typeof c.configuration === 'object'
      ? c.configuration
      : {}) as TelnyxCarrierConfig;

    return {
      carrierId: c.id,
      carrierCode: c.code,
      carrierType: c.carrierType,
      tenantId: c.tenantId,
      dispatcherSet: Number(cfg.dispatcherSet ?? this.config.get('TELNYX_DISPATCHER_SET') ?? 2),
      sipHost: cfg.sipHost || this.defaultSipHost,
      sipPort: Number(cfg.sipPort ?? 5060),
      transport: cfg.transport ?? 'udp',
      connectionId: cfg.connectionId,
      outboundProfileId: cfg.outboundProfileId,
      health: cfg.health ?? 'GREEN',
      backupSipHost: cfg.backupSipHost,
      failoverEnabled: cfg.failoverEnabled ?? true,
    };
  }

  private mapEventType(raw: string): string {
    const r = raw.toLowerCase();
    if (r.includes('call.initiated') || r.includes('call.answered')) return 'call.progress';
    if (r.includes('call.hangup') || r.includes('call.terminated')) return 'call.ended';
    if (r.includes('number') || r.includes('order')) return 'number.lifecycle';
    return `carrier.${raw}`;
  }

  private verifySignature(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): boolean {
    if (!this.webhookSecret) {
      // Dev: open when secret unset (mirrors telecom service-auth stub)
      this.logger.warn(
        JSON.stringify({
          event: 'carrier.webhook.stub_open',
          message: 'TELNYX_WEBHOOK_SECRET unset — accepting webhook',
        }),
      );
      return true;
    }
    const sigHeader =
      headerValue(headers, 'telnyx-signature-ed25519') ||
      headerValue(headers, 'x-telnyx-signature') ||
      headerValue(headers, 'x-vsp-telnyx-signature');
    if (!sigHeader) return false;

    // HMAC-SHA256 of raw JSON (lab-compatible). Production may use Ed25519 per Telnyx docs.
    const raw = typeof body === 'string' ? body : JSON.stringify(body ?? {});
    const expected = createHmac('sha256', this.webhookSecret).update(raw).digest('hex');
    try {
      const a = Buffer.from(sigHeader.replace(/^sha256=/i, ''), 'utf8');
      const b = Buffer.from(expected, 'utf8');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return '';
  const v = headers[key];
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
}
