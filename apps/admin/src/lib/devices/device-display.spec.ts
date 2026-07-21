import {
  buildDeviceDetailFields,
  getRegistrationBadge,
  getProvisioningStatusLabel,
} from './device-display';

describe('device-display', () => {
  it('maps registered devices to Online', () => {
    expect(
      getRegistrationBadge({
        sipEndpoint: { registrationStatus: 'REGISTERED' },
        provisioningStatus: 'PROVISIONED',
      }),
    ).toEqual({ emoji: '🟢', label: 'Online', tone: 'success' });
  });

  it('maps provisioned but unregistered devices to waiting badge', () => {
    expect(
      getRegistrationBadge({
        sipEndpoint: { registrationStatus: 'UNREGISTERED' },
        provisioningStatus: 'PROVISIONED',
      }),
    ).toEqual({
      emoji: '🟡',
      label: 'Provisioned – Waiting for Registration',
      tone: 'warning',
    });
  });

  it('omits empty detail fields', () => {
    const fields = buildDeviceDetailFields(
      {
        manufacturer: 'GRANDSTREAM',
        model: 'GRP2601',
        deviceType: 'DESK_PHONE',
        macAddress: 'ec74d751e3e7',
        provisioningStatus: 'PROVISIONED',
        isPrimary: true,
      },
      null,
    );

    expect(fields.map((f) => f.id)).toEqual([
      'manufacturer',
      'model',
      'deviceType',
      'mac',
      'provisioningStatus',
      'primary',
    ]);
    expect(getProvisioningStatusLabel('FAILED')).toBe('Failed');
  });
});
