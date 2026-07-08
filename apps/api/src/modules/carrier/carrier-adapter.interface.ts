/**
 * Carrier Adapter contract (ADR-010 / TEL-CAR-001).
 * Business modules never call Telnyx APIs directly.
 */

export type CarrierHealthStatus = 'GREEN' | 'YELLOW' | 'RED';

export interface TrunkHint {
  carrierId: string;
  carrierCode: string;
  carrierType: string;
  tenantId: string;
  /** Kamailio dispatcher set id */
  dispatcherSet: number;
  /** Primary SIP URI host for R-URI rewrite */
  sipHost: string;
  sipPort: number;
  transport: 'udp' | 'tcp' | 'tls';
  connectionId?: string;
  outboundProfileId?: string;
  health: CarrierHealthStatus;
  /** Optional backup host for failover hook */
  backupSipHost?: string;
  failoverEnabled: boolean;
}

export interface OutboundTrunkRequest {
  tenantId: string;
  fromLineId: string;
  cliE164?: string;
  destinationE164: string;
  preferredCarrierCode?: string;
}

export interface CarrierDidLookup {
  e164: string;
  phoneNumberId: string;
  tenantId: string;
  lineId?: string;
  carrierId?: string;
  carrierCode?: string;
}

export interface NormalizedCarrierEvent {
  eventId: string;
  provider: 'TELNYX';
  type: string;
  tenantId?: string;
  platformUuid?: string;
  telnyxCallId?: string;
  telnyxOrderId?: string;
  e164?: string;
  status?: string;
  rawType: string;
  receivedAt: string;
  payload: Record<string, unknown>;
}

export interface CarrierAdapter {
  readonly provider: string;
  selectOutboundTrunk(req: OutboundTrunkRequest): Promise<TrunkHint | null>;
  getHealth(tenantId: string, carrierCode?: string): Promise<CarrierHealthStatus>;
  /** Failover hook: next trunk after primary failure */
  selectFailoverTrunk(req: OutboundTrunkRequest, failed: TrunkHint): Promise<TrunkHint | null>;
  normalizeWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): Promise<NormalizedCarrierEvent | null>;
}

export const CARRIER_ADAPTER = Symbol('CARRIER_ADAPTER');
