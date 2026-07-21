import {
  computeExtensionHubStats,
  filterHubRowsByLifecycle,
  matchesHubLifecycleRow,
  parseHubLifecycleScope,
} from './extension-hub-lifecycle.util';

const baseRow = {
  archived: false,
  lineStatus: 'ACTIVE' as const,
  did: null,
  dids: [] as Array<{ id: string }>,
  status: 'NoDevice' as const,
  onlineStatus: 'Offline' as const,
  device: null,
  hasMobileApp: false,
  hasDeskPhone: false,
  extension: '102',
  displayName: 'Extension 102',
  linkedUser: null,
};

describe('extension-hub-lifecycle.util', () => {
  describe('parseHubLifecycleScope', () => {
    it('defaults to active', () => {
      expect(parseHubLifecycleScope()).toBe('active');
      expect(parseHubLifecycleScope('')).toBe('active');
      expect(parseHubLifecycleScope('invalid')).toBe('active');
    });

    it('accepts archived and all', () => {
      expect(parseHubLifecycleScope('archived')).toBe('archived');
      expect(parseHubLifecycleScope('all')).toBe('all');
    });
  });

  describe('matchesHubLifecycleRow', () => {
    it('excludes archived and inactive from active scope', () => {
      expect(matchesHubLifecycleRow({ archived: false, lineStatus: 'ACTIVE' }, 'active')).toBe(true);
      expect(matchesHubLifecycleRow({ archived: true, lineStatus: 'ACTIVE' }, 'active')).toBe(false);
      expect(matchesHubLifecycleRow({ archived: false, lineStatus: 'INACTIVE' }, 'active')).toBe(false);
    });
  });

  describe('filterHubRowsByLifecycle', () => {
    it('returns only archived rows for archived scope', () => {
      const rows = [
        { ...baseRow, extension: '100' },
        { ...baseRow, extension: '101', archived: true },
      ];
      expect(filterHubRowsByLifecycle(rows, 'archived')).toHaveLength(1);
      expect(filterHubRowsByLifecycle(rows, 'archived')[0]?.extension).toBe('101');
    });
  });

  describe('computeExtensionHubStats', () => {
    it('counts online/offline from onlineStatus on the same filtered dataset', () => {
      const rows = [
        { ...baseRow, extension: '100', onlineStatus: 'Online' as const, status: 'Registered' as const },
        { ...baseRow, extension: '101', onlineStatus: 'Offline' as const },
        { ...baseRow, extension: '102', archived: true, onlineStatus: 'Offline' as const },
      ];
      const active = filterHubRowsByLifecycle(rows, 'active');
      const stats = computeExtensionHubStats(active);

      expect(stats.totalExtensions).toBe(2);
      expect(stats.onlineExtensions).toBe(1);
      expect(stats.offlineDevices).toBe(1);
      expect(stats.registeredDevices).toBe(1);
    });
  });
});
