import { afterEach, describe, expect, it } from 'vitest';
import { decryptBeneficiary, encryptBeneficiary } from './beneficiary-crypto.util.js';

const original = process.env.REFUND_ENCRYPTION_KEY;
afterEach(() => { process.env.REFUND_ENCRYPTION_KEY = original; });

describe('beneficiary encryption', () => {
  it('encrypts account details and detects ciphertext changes', () => {
    process.env.REFUND_ENCRYPTION_KEY = '12'.repeat(32);
    const beneficiary = { bankBin: '970436', accountNumber: '123456789', accountName: 'Nguyen A' };
    const encrypted = encryptBeneficiary(beneficiary);
    expect(encrypted).not.toContain(beneficiary.accountNumber);
    expect(decryptBeneficiary(encrypted)).toEqual(beneficiary);
    const parts = encrypted.split('.');
    parts[2] = (parts[2].startsWith('A') ? 'B' : 'A') + parts[2].slice(1);
    expect(() => decryptBeneficiary(parts.join('.'))).toThrow();
  });
});
