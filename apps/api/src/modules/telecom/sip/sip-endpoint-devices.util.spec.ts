import {
  hasActiveAssignment,
  pickRegistrableDevice,
} from './sip-endpoint-devices.util';

describe('sip-endpoint-devices.util', () => {
  const webrtc = {
    id: 'dev-webrtc',
    lineId: 'line-1',
    deletedAt: null,
    assignments: [] as Array<{
      tenantId: string;
      lineId: string | null;
      effectiveTo: Date | null;
      deletedAt: Date | null;
    }>,
  };
  const desk = {
    id: 'dev-desk',
    lineId: 'line-1',
    deletedAt: null,
    assignments: [
      {
        tenantId: 't1',
        lineId: 'line-1',
        effectiveTo: null,
        deletedAt: null,
      },
    ],
  };
  const mobile = {
    id: 'dev-mobile',
    lineId: 'line-1',
    deletedAt: null,
    assignments: [
      {
        tenantId: 't1',
        lineId: 'line-1',
        effectiveTo: null,
        deletedAt: null,
      },
    ],
  };

  it('picks preferred deviceId among siblings on the same endpoint', () => {
    expect(pickRegistrableDevice([webrtc, desk, mobile], 'dev-mobile')?.id).toBe('dev-mobile');
  });

  it('prefers a device with active assignment when no deviceId given', () => {
    expect(pickRegistrableDevice([webrtc, desk])?.id).toBe('dev-desk');
  });

  it('falls back to line-bound device without assignment (Extension-First WEBRTC)', () => {
    expect(pickRegistrableDevice([webrtc])?.id).toBe('dev-webrtc');
  });

  it('returns null for empty or deleted-only lists', () => {
    expect(pickRegistrableDevice([])).toBeNull();
    expect(
      pickRegistrableDevice([{ ...webrtc, deletedAt: new Date() }]),
    ).toBeNull();
  });

  it('detects active assignment', () => {
    expect(hasActiveAssignment(desk)).toBe(true);
    expect(hasActiveAssignment(webrtc)).toBe(false);
  });
});
