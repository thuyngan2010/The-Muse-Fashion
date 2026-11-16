import { describe, expect, it } from 'vitest';
import { hash } from 'bcryptjs';
import { hashPassword, verifyPassword, needsPasswordUpgrade } from './password.util.js';

describe('Versioned password hashing', () => {
  it('checks the whole password after 72 bytes, including Unicode', async () => {
    const prefix = 'Aa1' + 'á'.repeat(36);
    const encoded = await hashPassword(prefix + 'original');
    expect(await verifyPassword(prefix + 'original', encoded)).toBe(true);
    expect(await verifyPassword(prefix + 'different', encoded)).toBe(false);
    expect(needsPasswordUpgrade(encoded)).toBe(false);
  });
  it('keeps legacy bcrypt logins compatible for migration', async () => {
    const encoded = await hash('Legacy-Password1', 4);
    expect(needsPasswordUpgrade(encoded)).toBe(true);
    expect(await verifyPassword('Legacy-Password1', encoded)).toBe(true);
    expect(await verifyPassword('Wrong-Password1', encoded)).toBe(false);
  });
  it('rejects unknown or malformed hash formats', async () => {
    expect(await verifyPassword('Password1', '$scrypt$32768$8$3$bad$bad')).toBe(false);
    expect(await verifyPassword('Password1', 'unknown')).toBe(false);
  });
});
