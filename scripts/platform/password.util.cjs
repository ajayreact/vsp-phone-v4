'use strict';

const { randomBytes, scryptSync } = require('node:crypto');

/** Matches AuthService.verifyPassword format: scrypt$N$r$saltB64$hashB64 */
function hashPassword(plain) {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, 32);
  return `scrypt$16384$8$${salt.toString('base64')}$${derived.toString('base64')}`;
}

module.exports = { hashPassword };
