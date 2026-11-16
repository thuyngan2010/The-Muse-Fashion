import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppConfig } from '../../common/app-config.js';

function cipherKey(): Buffer {
  const value = AppConfig.require('EMAIL_TOKEN_ENCRYPTION_KEY');
  if (!/^[0-9a-fA-F]{64}$/.test(value)) throw new Error('EMAIL_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters');
  return Buffer.from(value, 'hex');
}

export function encryptEmailToken(token: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cipherKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptEmailToken(value: string): string {
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Email token payload is unavailable');
  const decipher = createDecipheriv('aes-256-gcm', cipherKey(), Buffer.from(parts[1], 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
}
