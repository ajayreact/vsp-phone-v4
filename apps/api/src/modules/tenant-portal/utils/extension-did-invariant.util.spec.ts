import {
  canonicalExtensionNumber,
  parseTombstoneExtensionNumber,
  phoneNeedsExtensionRepair,
} from './extension-did-invariant.util';

describe('extension-did-invariant.util', () => {
  describe('parseTombstoneExtensionNumber', () => {
    it('parses tombstone extension numbers', () => {
      expect(parseTombstoneExtensionNumber('102__del__a74638ae8b9e')).toBe('102');
      expect(parseTombstoneExtensionNumber('100__del__09b66304a791')).toBe('100');
    });

    it('returns null for live extension numbers', () => {
      expect(parseTombstoneExtensionNumber('101')).toBeNull();
    });
  });

  describe('canonicalExtensionNumber', () => {
    it('returns original number from tombstone', () => {
      expect(canonicalExtensionNumber('102__del__a74638ae8b9e')).toBe('102');
    });

    it('returns numeric extension strings', () => {
      expect(canonicalExtensionNumber('103')).toBe('103');
    });

    it('rejects E.164-like strings', () => {
      expect(canonicalExtensionNumber('13136506292')).toBeNull();
    });
  });

  describe('phoneNeedsExtensionRepair', () => {
    it('needs repair when line_id is null', () => {
      expect(phoneNeedsExtensionRepair({ lineId: null, hasLiveExtension: false })).toBe(true);
    });

    it('needs repair when line has no live extension', () => {
      expect(phoneNeedsExtensionRepair({ lineId: 'line-1', hasLiveExtension: false })).toBe(true);
    });

    it('is satisfied when live extension exists', () => {
      expect(phoneNeedsExtensionRepair({ lineId: 'line-1', hasLiveExtension: true })).toBe(false);
    });
  });
});
