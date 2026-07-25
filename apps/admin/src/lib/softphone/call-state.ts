/** Professional call-state machine — maps SIP lifecycle to UI labels (3CX / Teams style). */

export type CallPhase =
  | 'idle'
  | 'dialing'
  | 'trying'
  | 'calling'
  | 'ringing'
  | 'connected'
  | 'active'
  | 'hold'
  | 'ended'
  | 'cancelled'
  | 'busy'
  | 'unavailable'
  | 'no-response';

export type SoftphoneRegistrationState = 'idle' | 'connecting' | 'registered' | 'error';

export type SoftphoneState = SoftphoneRegistrationState | CallPhase;

const TERMINAL_PHASES: ReadonlySet<CallPhase> = new Set([
  'ended',
  'cancelled',
  'busy',
  'unavailable',
  'no-response',
]);

const IN_SESSION_PHASES: ReadonlySet<CallPhase> = new Set([
  'dialing',
  'trying',
  'calling',
  'ringing',
  'connected',
  'active',
  'hold',
]);

/** Phases where the connected-call timer should run (wall-clock from 200 OK). */
export const TIMER_PHASES: ReadonlySet<CallPhase> = new Set(['connected', 'active', 'hold']);

export function callPhaseLabel(phase: CallPhase): string {
  switch (phase) {
    case 'dialing':
      return 'Dialing…';
    case 'trying':
      return 'Trying…';
    case 'calling':
      return 'Calling…';
    case 'ringing':
      return 'Ringing…';
    case 'connected':
      return 'Connected';
    case 'active':
      return 'Active Call';
    case 'hold':
      return 'On Hold';
    case 'ended':
      return 'Call Ended';
    case 'cancelled':
      return 'Cancelled';
    case 'busy':
      return 'Busy';
    case 'unavailable':
      return 'Unavailable';
    case 'no-response':
      return 'No Response';
    default:
      return '';
  }
}

export function isCallSessionState(state: SoftphoneState): boolean {
  if (state === 'registered' || state === 'idle' || state === 'connecting' || state === 'error') {
    return false;
  }
  return IN_SESSION_PHASES.has(state as CallPhase) || TERMINAL_PHASES.has(state as CallPhase);
}

export function isTerminalCallPhase(phase: CallPhase): boolean {
  return TERMINAL_PHASES.has(phase);
}

/** Map SIP provisional/final response codes to call phases (outbound INVITE). */
export function callPhaseFromSipStatus(code: number): CallPhase | null {
  if (code === 100) return 'trying';
  if (code === 180 || code === 183) return 'ringing';
  if (code >= 200 && code < 300) return 'connected';
  if (code === 486) return 'busy';
  if (code === 487) return 'cancelled';
  if (code === 408) return 'no-response';
  if (code === 480 || code === 404) return 'unavailable';
  if (code === 603) return 'busy';
  return null;
}

/** After 100 Trying, pre-ring progress (101, 182, etc.) maps to Calling. */
export function callPhaseFromProvisional(code: number, sawTrying: boolean): CallPhase {
  if (code === 100) return 'trying';
  if (code === 180 || code === 183) return 'ringing';
  if (sawTrying && code >= 101 && code < 180) return 'calling';
  if (code >= 101 && code < 180) return 'calling';
  return 'calling';
}
