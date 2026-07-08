import { createHash, timingSafeEqual } from 'node:crypto';

/** RFC 2617/7616 Digest helpers for SIP (MD5). */

export function md5Hex(input: string): string {
  return createHash('md5').update(input, 'utf8').digest('hex');
}

/** HA1 = MD5(username:realm:password) */
export function computeHa1(username: string, realm: string, password: string): string {
  return md5Hex(`${username}:${realm}:${password}`);
}

/** HA2 = MD5(method:digestUri) */
export function computeHa2(method: string, digestUri: string): string {
  return md5Hex(`${method}:${digestUri}`);
}

/**
 * Expected response without qop:
 * MD5(HA1:nonce:HA2)
 * With qop=auth:
 * MD5(HA1:nonce:nc:cnonce:qop:HA2)
 */
export function computeDigestResponse(params: {
  ha1: string;
  nonce: string;
  method: string;
  uri: string;
  qop?: string;
  nc?: string;
  cnonce?: string;
}): string {
  const ha2 = computeHa2(params.method, params.uri);
  if (params.qop === 'auth' || params.qop === 'auth-int') {
    const nc = params.nc ?? '00000001';
    const cnonce = params.cnonce ?? '';
    return md5Hex(`${params.ha1}:${params.nonce}:${nc}:${cnonce}:${params.qop}:${ha2}`);
  }
  return md5Hex(`${params.ha1}:${params.nonce}:${ha2}`);
}

/** Constant-time hex compare; returns false if lengths differ. */
export function safeEqualHex(a: string, b: string): boolean {
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  if (aa.length !== bb.length) return false;
  try {
    return timingSafeEqual(Buffer.from(aa, 'utf8'), Buffer.from(bb, 'utf8'));
  } catch {
    return false;
  }
}
