import { randomBytes, scryptSync } from 'node:crypto';

/** scrypt$N$r$saltB64$hashB64 */
export function hashPassword(plain: string): string {
  const N = 16384;
  const r = 8;
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, 64, { N, r });
  return `scrypt$${N}$${r}$${salt.toString('base64')}$${derived.toString('base64')}`;
}
