export type {
  CallPhase,
  SoftphoneRegistrationState,
  SoftphoneState,
} from './call-state';
export {
  callPhaseFromProvisional,
  callPhaseFromSipStatus,
  callPhaseLabel,
  isCallSessionState,
  isTerminalCallPhase,
  TIMER_PHASES,
} from './call-state';

import type { CallPhase, SoftphoneState } from './call-state';

export type SoftphoneLayout = 'full' | 'mini' | 'dock' | 'floating';

export type NetworkQuality = {
  jitterMs: number;
  packetLossPct: number;
  mos: number;
  rttMs: number;
};

export type CallSessionInfo = {
  id: string;
  remote: string;
  direction: 'inbound' | 'outbound';
  /** Wall-clock ms when 200 OK confirmed — drives connected-call timer. */
  connectedAt: number | null;
  phase: CallPhase;
  held: boolean;
  muted: boolean;
};

export type SoftphoneEvent =
  | { type: 'state'; state: SoftphoneState; detail?: string }
  | { type: 'log'; message: string }
  | { type: 'incoming'; from: string; sessionId: string }
  | { type: 'waiting'; from: string; sessionId: string }
  | { type: 'stats'; stats: NetworkQuality }
  | { type: 'sessions'; sessions: CallSessionInfo[] };

export type EnrollConfig = {
  sipUsername: string;
  sipPassword: string;
  aor: string;
  wssUrl: string;
  iceServers: RTCIceServer[];
  expiresAt: string;
  onReEnroll: () => Promise<{
    sipPassword: string;
    expiresAt: string;
    wssUrl: string;
    iceServers: RTCIceServer[];
  }>;
};
