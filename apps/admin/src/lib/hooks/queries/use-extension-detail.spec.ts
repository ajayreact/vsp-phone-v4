import {
  extensionDetailMatchesRow,
  mapExtensionDetailToForm,
  type ExtensionHubRow,
} from './use-extension-hub';

const hubRow = (overrides: Partial<ExtensionHubRow> = {}): ExtensionHubRow => ({
  id: 'ext-101',
  lineId: 'line-101',
  extension: '101',
  displayName: 'Reception',
  label: '101 • Reception',
  description: 'Front desk',
  department: { id: 'dept-1', name: 'Ops' },
  did: { id: 'did-1', number: '+15551234567', formatted: '+1 (555) 123-4567' },
  device: null,
  hasMobileApp: false,
  hasDeskPhone: false,
  status: 'NoDevice',
  statusLabel: 'No device',
  onlineStatus: 'Offline',
  registrationLabel: 'Not registered',
  lastCallAt: null,
  lastCallRelative: null,
  linkedUser: null,
  recordingEnabled: false,
  voicemailEnabled: false,
  lastRegistrationAt: null,
  provisionLabel: '',
  ...overrides,
});

describe('extension detail stability helpers', () => {
  describe('extensionDetailMatchesRow', () => {
    it('accepts detail when ids match', () => {
      expect(extensionDetailMatchesRow({ id: 'ext-101' }, 'ext-101')).toBe(true);
    });

    it('rejects detail when ids differ', () => {
      expect(extensionDetailMatchesRow({ id: 'ext-101' }, 'ext-102')).toBe(false);
    });

    it('accepts detail without id field', () => {
      expect(extensionDetailMatchesRow({ line: {} }, 'ext-101')).toBe(true);
    });
  });

  describe('mapExtensionDetailToForm', () => {
    it('maps telephony, caller ID, and recording policy fields', () => {
      const mapped = mapExtensionDetailToForm(hubRow(), {
        id: 'ext-101',
        description: 'Front desk',
        department: { id: 'dept-1', name: 'Ops' },
        line: {
          name: 'Reception',
          callerId: { callerIdName: 'Main Line' },
          telephonySettings: {
            pin: '1234',
            callForwardEnabled: true,
            callForwardDestination: '102',
            dndEnabled: true,
            voicemailNotifyEmail: 'vm@example.com',
          },
          recordingPolicy: { recordingEnabled: true },
          user: { id: 'user-1' },
        },
      });

      expect(mapped).toEqual({
        displayName: 'Reception',
        description: 'Front desk',
        departmentId: 'dept-1',
        linkedUserId: 'user-1',
        firstName: '',
        lastName: '',
        email: '',
        callerIdName: 'Main Line',
        outboundCallerId: '+1 (555) 123-4567',
        language: 'en',
        timezone: 'America/New_York',
        pin: '1234',
        voicemailEnabled: false,
        voicemailNotifyEmail: 'vm@example.com',
        voicemailGreeting: '',
        callForwardEnabled: true,
        callForwardDestination: '102',
        dndEnabled: true,
        callWaitingEnabled: true,
        followMeEnabled: false,
        ringTimeout: '30',
        recordingEnabled: true,
        selectedDidId: 'did-1',
        emergencyAddress: '',
        cnam: 'Main Line',
        inboundEnabled: true,
        outboundEnabled: true,
        internationalCalling: false,
        internalCalls: true,
        emergencyCalls: true,
      });
    });

    it('falls back to voicemail pin when telephony pin is absent', () => {
      const mapped = mapExtensionDetailToForm(hubRow(), {
        id: 'ext-101',
        line: {
          telephonySettings: {},
          voicemail: { pin: '9999' },
        },
      });

      expect(mapped.pin).toBe('9999');
    });
  });
});
