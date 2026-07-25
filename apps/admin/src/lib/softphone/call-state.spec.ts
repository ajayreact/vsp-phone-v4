import {
  callPhaseFromSipStatus,
  callPhaseLabel,
  isCallSessionState,
  isTerminalCallPhase,
  TIMER_PHASES,
} from './call-state';

describe('call-state', () => {
  it('maps SIP status codes to phases', () => {
    expect(callPhaseFromSipStatus(100)).toBe('trying');
    expect(callPhaseFromSipStatus(180)).toBe('ringing');
    expect(callPhaseFromSipStatus(183)).toBe('ringing');
    expect(callPhaseFromSipStatus(200)).toBe('connected');
    expect(callPhaseFromSipStatus(486)).toBe('busy');
    expect(callPhaseFromSipStatus(487)).toBe('cancelled');
    expect(callPhaseFromSipStatus(408)).toBe('no-response');
  });

  it('labels phases for UI', () => {
    expect(callPhaseLabel('ringing')).toBe('Ringing…');
    expect(callPhaseLabel('hold')).toBe('On Hold');
  });

  it('runs timer only on connected phases including hold', () => {
    expect(TIMER_PHASES.has('connected')).toBe(true);
    expect(TIMER_PHASES.has('active')).toBe(true);
    expect(TIMER_PHASES.has('hold')).toBe(true);
    expect(TIMER_PHASES.has('ringing')).toBe(false);
    expect(TIMER_PHASES.has('dialing')).toBe(false);
  });

  it('detects in-session vs registration states', () => {
    expect(isCallSessionState('ringing')).toBe(true);
    expect(isCallSessionState('hold')).toBe(true);
    expect(isCallSessionState('registered')).toBe(false);
  });

  it('marks terminal phases', () => {
    expect(isTerminalCallPhase('busy')).toBe(true);
    expect(isTerminalCallPhase('active')).toBe(false);
  });
});
