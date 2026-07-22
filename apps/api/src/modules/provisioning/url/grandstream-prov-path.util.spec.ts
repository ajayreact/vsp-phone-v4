import {
  canonicalGrandstreamProvPath,
  resolveGrandstreamProvPath,
  resolveProvMacFromRequest,
} from './grandstream-prov-path.util';

describe('grandstream-prov-path', () => {
  const mac = 'ec74d751e3e7';
  const canonical = `/gs/${mac}/cfg.xml`;

  describe('resolveGrandstreamProvPath', () => {
    it('resolves legacy provisioning path', () => {
      const result = resolveGrandstreamProvPath(`/gs/${mac}/cfg.xml`);
      expect(result).toEqual({
        mac,
        requestedPath: `/gs/${mac}/cfg.xml`,
        normalizedPath: canonical,
        style: 'legacy',
      });
    });

    it('resolves Grandstream native MAC filename at directory root', () => {
      const result = resolveGrandstreamProvPath(`/gs/cfg${mac}.xml`);
      expect(result).toEqual({
        mac,
        requestedPath: `/gs/cfg${mac}.xml`,
        normalizedPath: canonical,
        style: 'native-mac',
      });
    });

    it('resolves Grandstream model filename at directory root', () => {
      const result = resolveGrandstreamProvPath('/gs/cfggrp2601.xml');
      expect(result).toMatchObject({
        mac: null,
        requestedPath: '/gs/cfggrp2601.xml',
        normalizedPath: '/gs/cfggrp2601.xml',
        style: 'native-model',
      });
    });

    it('resolves Grandstream generic cfg.xml at directory root', () => {
      const result = resolveGrandstreamProvPath('/gs/cfg.xml');
      expect(result).toMatchObject({
        mac: null,
        requestedPath: '/gs/cfg.xml',
        normalizedPath: '/gs/cfg.xml',
        style: 'native-generic',
      });
    });

    it('normalizes directory-style path when cfg.xml is treated as a directory', () => {
      const requested = `/gs/${mac}/cfg.xml/cfg${mac}.xml`;
      const result = resolveGrandstreamProvPath(requested);
      expect(result).toEqual({
        mac,
        requestedPath: requested,
        normalizedPath: canonical,
        style: 'directory-mac',
      });
    });

    it('normalizes directory-style model filename append', () => {
      const requested = `/gs/${mac}/cfg.xml/cfggrp2601.xml`;
      const result = resolveGrandstreamProvPath(requested);
      expect(result).toEqual({
        mac,
        requestedPath: requested,
        normalizedPath: canonical,
        style: 'directory-model',
      });
    });

    it('normalizes directory-style generic cfg.xml append', () => {
      const requested = `/gs/${mac}/cfg.xml/cfg.xml`;
      const result = resolveGrandstreamProvPath(requested);
      expect(result).toEqual({
        mac,
        requestedPath: requested,
        normalizedPath: canonical,
        style: 'directory-generic',
      });
    });

    it('returns null style for unknown gs paths', () => {
      const result = resolveGrandstreamProvPath('/gs/not-a-provisioning-path');
      expect(result.style).toBeNull();
      expect(result.mac).toBeNull();
    });

    it('strips query strings from requested path', () => {
      const result = resolveGrandstreamProvPath(`/gs/${mac}/cfg.xml?ts=1`);
      expect(result.requestedPath).toBe(`/gs/${mac}/cfg.xml`);
    });
  });

  describe('resolveProvMacFromRequest', () => {
    it('prefers MAC embedded in path over route param and auth username', () => {
      expect(
        resolveProvMacFromRequest(`/gs/${mac}/cfg.xml`, '000000000000', '000000000000'),
      ).toBe(mac);
    });

    it('falls back to Basic auth username for native model/generic paths', () => {
      expect(resolveProvMacFromRequest('/gs/cfggrp2601.xml', undefined, mac)).toBe(mac);
      expect(resolveProvMacFromRequest('/gs/cfg.xml', undefined, mac)).toBe(mac);
    });
  });

  describe('canonicalGrandstreamProvPath', () => {
    it('lowercases MAC in canonical path', () => {
      expect(canonicalGrandstreamProvPath('EC74D751E3E7')).toBe(canonical);
    });
  });
});
