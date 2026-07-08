export type SoftphoneState =
  | 'idle'
  | 'connecting'
  | 'registered'
  | 'calling'
  | 'ringing'
  | 'in-call'
  | 'held'
  | 'error';

export type SoftphoneEvent =
  | { type: 'state'; state: SoftphoneState; detail?: string }
  | { type: 'log'; message: string }
  | { type: 'incoming'; from: string };

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
