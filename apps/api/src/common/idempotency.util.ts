import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !UUID_PATTERN.test(key)) throw new BadRequestException('Idempotency-Key must be a UUID');
  return key.toLowerCase();
}

export function requestHash(body: unknown): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalize(item)]));
    }
    return value;
  };
  return createHash('sha256').update(JSON.stringify(normalize(body))).digest('hex');
}

export function assertSameRequest(storedHash: string | undefined, currentHash: string): void {
  if (storedHash && storedHash !== currentHash) {
    throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency-Key was used with a different request' });
  }
}
