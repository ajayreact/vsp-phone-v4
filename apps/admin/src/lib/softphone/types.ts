export type SoftphoneState =
  | 'idle'
  | 'connecting'
  | 'registered'
  | 'calling'
  | 'ringing'
  | 'in-call'
  | 'held'
  | 'error';

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
  startedAt: number;
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
