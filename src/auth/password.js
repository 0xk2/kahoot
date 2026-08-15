import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, OPTIONS);
  return `scrypt$${OPTIONS.N}$${OPTIONS.r}$${OPTIONS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, encoded) {
  try {
    const [algorithm, n, r, p, saltValue, keyValue] = encoded.split('$');
    if (algorithm !== 'scrypt') return false;
    const expected = Buffer.from(keyValue, 'base64');
    const actual = await scrypt(password, Buffer.from(saltValue, 'base64'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 32 * 1024 * 1024
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
