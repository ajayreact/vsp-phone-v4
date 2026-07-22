import { isValidMac, normalizeMac } from '../vault/provisioning-vault.service';

/** Grandstream provisioning fetch style (directory vs legacy vs native filename). */
export type GrandstreamProvStyle =
  | 'legacy'
  | 'native-mac'
  | 'native-model'
  | 'native-generic'
  | 'directory-mac'
  | 'directory-model'
  | 'directory-generic';

export interface GrandstreamProvPathResolution {
  /** MAC from path when embedded; null for model/generic native filenames. */
  mac: string | null;
  requestedPath: string;
  normalizedPath: string;
  style: GrandstreamProvStyle | null;
}

const MAC_CFG_FILENAME = /^cfg([a-f0-9]{12})\.xml$/i;
const MODEL_CFG_FILENAME = /^cfggrp\d+[a-z]*\.xml$/i;
const GENERIC_CFG_FILENAME = /^cfg\.xml$/i;

/** Canonical ADR-042 path served to all Grandstream entry points. */
export function canonicalGrandstreamProvPath(mac: string): string {
  return `/gs/${normalizeMac(mac)}/cfg.xml`;
}

/** Strip query string and collapse duplicate slashes. */
export function normalizeRequestPath(rawPath: string): string {
  const pathOnly = rawPath.split('?')[0]?.split('#')[0] ?? rawPath;
  const withLeading = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  return withLeading.replace(/\/{2,}/g, '/');
}

function extractMacFromCfgFilename(filename: string): string | null {
  const match = filename.match(MAC_CFG_FILENAME);
  if (!match?.[1]) return null;
  const mac = normalizeMac(match[1]);
  return isValidMac(mac) ? mac : null;
}

/**
 * Resolve Grandstream provisioning URLs to a canonical `/gs/{mac}/cfg.xml` path.
 * Supports legacy paths, native filenames, and directory-style cfg.xml append paths.
 */
export function resolveGrandstreamProvPath(rawPath: string): GrandstreamProvPathResolution {
  const requestedPath = normalizeRequestPath(rawPath);

  if (!requestedPath.startsWith('/gs/')) {
    return { mac: null, requestedPath, normalizedPath: requestedPath, style: null };
  }

  const remainder = requestedPath.slice('/gs/'.length);

  const legacyMatch = remainder.match(/^([a-f0-9]{12})\/cfg\.xml\/?$/i);
  if (legacyMatch?.[1]) {
    const mac = normalizeMac(legacyMatch[1]);
    if (isValidMac(mac)) {
      return {
        mac,
        requestedPath,
        normalizedPath: canonicalGrandstreamProvPath(mac),
        style: 'legacy',
      };
    }
  }

  const directoryMatch = remainder.match(/^([a-f0-9]{12})\/cfg\.xml\/(.+)$/i);
  if (directoryMatch?.[1] && directoryMatch[2]) {
    const mac = normalizeMac(directoryMatch[1]);
    const suffix = directoryMatch[2];
    if (!isValidMac(mac)) {
      return { mac: null, requestedPath, normalizedPath: requestedPath, style: null };
    }
    const normalizedPath = canonicalGrandstreamProvPath(mac);
    if (MAC_CFG_FILENAME.test(suffix)) {
      return { mac, requestedPath, normalizedPath, style: 'directory-mac' };
    }
    if (MODEL_CFG_FILENAME.test(suffix)) {
      return { mac, requestedPath, normalizedPath, style: 'directory-model' };
    }
    if (GENERIC_CFG_FILENAME.test(suffix)) {
      return { mac, requestedPath, normalizedPath, style: 'directory-generic' };
    }
    return { mac: null, requestedPath, normalizedPath: requestedPath, style: null };
  }

  const macFromFilename = extractMacFromCfgFilename(remainder);
  if (macFromFilename) {
    return {
      mac: macFromFilename,
      requestedPath,
      normalizedPath: canonicalGrandstreamProvPath(macFromFilename),
      style: 'native-mac',
    };
  }

  if (MODEL_CFG_FILENAME.test(remainder)) {
    return {
      mac: null,
      requestedPath,
      normalizedPath: `/gs/${remainder}`,
      style: 'native-model',
    };
  }

  if (GENERIC_CFG_FILENAME.test(remainder)) {
    return {
      mac: null,
      requestedPath,
      normalizedPath: '/gs/cfg.xml',
      style: 'native-generic',
    };
  }

  return { mac: null, requestedPath, normalizedPath: requestedPath, style: null };
}

/** Resolve MAC for auth from path resolution, route param, or Basic auth username. */
export function resolveProvMacFromRequest(
  rawPath: string,
  routeMacParam: string | undefined,
  basicAuthUsername: string | undefined,
): string | null {
  const resolution = resolveGrandstreamProvPath(rawPath);
  if (resolution.mac && isValidMac(resolution.mac)) {
    return resolution.mac;
  }

  const fromParam = normalizeMac(routeMacParam ?? '');
  if (isValidMac(fromParam)) {
    return fromParam;
  }

  const fromAuth = normalizeMac(basicAuthUsername ?? '');
  if (isValidMac(fromAuth)) {
    return fromAuth;
  }

  return null;
}

export function extractBasicAuthUsername(authorizationHeader: string | undefined): string | null {
  const header = authorizationHeader ?? '';
  if (!header.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  return sep >= 0 ? decoded.slice(0, sep) : decoded;
}
