/**
 * Pure digest helpers — runnable without Nest (Phase 6 unit smoke).
 * node -e "require('./dist/...')" or via validate-phase6.
 */
const { createHash, timingSafeEqual } = require('node:crypto');

function md5Hex(input) {
  return createHash('md5').update(input, 'utf8').digest('hex');
}

function computeHa1(username, realm, password) {
  return md5Hex(`${username}:${realm}:${password}`);
}

function computeDigestResponse({ ha1, nonce, method, uri, qop, nc, cnonce }) {
  const ha2 = md5Hex(`${method}:${uri}`);
  if (qop === 'auth' || qop === 'auth-int') {
    return md5Hex(`${ha1}:${nonce}:${nc || '00000001'}:${cnonce || ''}:${qop}:${ha2}`);
  }
  return md5Hex(`${ha1}:${nonce}:${ha2}`);
}

function safeEqualHex(a, b) {
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(Buffer.from(aa, 'utf8'), Buffer.from(bb, 'utf8'));
}

module.exports = { md5Hex, computeHa1, computeDigestResponse, safeEqualHex };
