export { CarrierModule } from './module';
export { CarrierService, normalizeE164 } from './carrier.service';
export { TelnyxCarrierAdapter } from './telnyx.carrier-adapter';
export { CARRIER_ADAPTER } from './carrier-adapter.interface';
export type {
  CarrierAdapter,
  TrunkHint,
  NormalizedCarrierEvent,
  OutboundTrunkRequest,
} from './carrier-adapter.interface';
