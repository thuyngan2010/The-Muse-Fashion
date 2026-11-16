import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { compare } from 'bcryptjs';

// Versioned hashes cover the complete UTF-8 password; bcrypt is read-only legacy support.
const PREFIX = '$scrypt$32768$8$3$';
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `${PREFIX}${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (/^\$2[aby]\$/.test(encoded)) return compare(password, encoded);
  if (!encoded.startsWith(PREFIX)) return false;
  const parts = encoded.slice(PREFIX.length).split('$');
  if (parts.length !== 2) return false;
  const [salt, expected] = parts;
  if (!/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(expected ?? '')) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(expected, 'hex'));
}
export function needsPasswordUpgrade(encoded: string): boolean { return !encoded.startsWith(PREFIX); }
