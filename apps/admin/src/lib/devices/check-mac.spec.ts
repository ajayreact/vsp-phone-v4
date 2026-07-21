import { checkMac, isValidMac, macCheckBlocksSubmit, normalizeMac } from './check-mac';
import { deviceRepository } from '../repositories/device.repository';

jest.mock('../repositories/device.repository', () => ({
  deviceRepository: {
    listDevices: jest.fn(),
  },
}));

const listDevices = deviceRepository.listDevices as jest.Mock;

describe('check-mac', () => {
  beforeEach(() => {
    listDevices.mockReset();
  });

  it('normalizes MAC addresses', () => {
    expect(normalizeMac('EC:74:D7:51:E3:E7')).toBe('ec74d751e3e7');
    expect(isValidMac('EC:74:D7:51:E3:E7')).toBe(true);
  });

  it('returns available when MAC is not enrolled', async () => {
    listDevices.mockResolvedValue([]);
    await expect(checkMac('EC74D751E3E7', { lineId: 'line-1', extension: '100' })).resolves.toEqual({
      status: 'available',
      message: 'MAC address available.',
    });
  });

  it('blocks same extension assignment', async () => {
    listDevices.mockResolvedValue([
      {
        macAddress: 'ec74d751e3e7',
        line: { id: 'line-1', extension: { extension: '100' } },
      },
    ]);
    await expect(checkMac('EC74D751E3E7', { lineId: 'line-1', extension: '100' })).resolves.toEqual({
      status: 'same_extension',
      message: 'This phone is already assigned to this extension.',
      extension: '100',
      extensionLabel: 'Extension 100',
    });
    expect(macCheckBlocksSubmit({ status: 'same_extension' })).toBe(true);
  });

  it('warns when MAC belongs to another extension', async () => {
    listDevices.mockResolvedValue([
      {
        macAddress: 'ec74d751e3e7',
        line: { id: 'line-2', name: 'Reception', extension: { extension: '101' } },
      },
    ]);
    await expect(checkMac('EC74D751E3E7', { lineId: 'line-1', extension: '100' })).resolves.toEqual({
      status: 'other_extension',
      message: 'This phone is currently assigned to Extension 101 (Reception).',
      extension: '101',
      extensionLabel: 'Extension 101 (Reception)',
    });
  });
});
