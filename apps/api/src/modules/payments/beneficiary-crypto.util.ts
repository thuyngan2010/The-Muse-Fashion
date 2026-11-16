import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppConfig } from '../../common/app-config.js';

export type Beneficiary = { bankBin: string; accountNumber: string; accountName: string };

function key(): Buffer {
  const value = AppConfig.require('REFUND_ENCRYPTION_KEY');
  if (!/^[0-9a-fA-F]{64}$/.test(value)) throw new Error('REFUND_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters');
  return Buffer.from(value, 'hex');
}

export function encryptBeneficiary(value: Beneficiary): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptBeneficiary(value: string): Beneficiary {
  const [version, nonce, tag, ciphertext, extra] = value.split('.');
  if (version !== 'v1' || !nonce || !tag || !ciphertext || extra) throw new Error('Invalid encrypted beneficiary');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(nonce, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')) as Beneficiary;
}

export function readBeneficiary(refund: { beneficiaryEncrypted?: string; beneficiary?: Beneficiary }): Beneficiary | undefined {
  if (refund.beneficiaryEncrypted) return decryptBeneficiary(refund.beneficiaryEncrypted);
  return refund.beneficiary;
}
