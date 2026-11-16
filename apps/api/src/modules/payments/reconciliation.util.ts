import { randomInt } from 'node:crypto';

const PAYMENT_CODE_PATTERN = /\b(FC[A-Z0-9]{6,18})\b/g;
const REFUND_CODE_PATTERN = /\b(RF[A-Z0-9]{6,18})\b/g;

export function generateReconciliationCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 8; i += 1) {
    suffix += alphabet[randomInt(alphabet.length)];
  }
  return `FC${suffix}`;
}

export function extractReconciliationCodes(content: string): string[] {
  const matches = content.toUpperCase().match(PAYMENT_CODE_PATTERN) ?? [];
  return [...new Set(matches)];
}

export function generateRefundReconciliationCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 8; i += 1) {
    suffix += alphabet[randomInt(alphabet.length)];
  }
  return `RF${suffix}`;
}

export function extractRefundReconciliationCodes(content: string): string[] {
  const matches = content.toUpperCase().match(REFUND_CODE_PATTERN) ?? [];
  return [...new Set(matches)];
}

export function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  return `${'*'.repeat(Math.max(0, accountNumber.length - 4))}${accountNumber.slice(-4)}`;
}
