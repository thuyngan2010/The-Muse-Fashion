import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service.js';

const noConnection = {} as never;

describe('RateLimitService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows requests within the limit', async () => {
    const service = new RateLimitService(noConnection);
    for (let i = 0; i < 5; i += 1) await service.consume('login:1.2.3.4:a@example.com', 5, 60_000);
    await expect(service.consume('login:1.2.3.4:a@example.com', 5, 60_000)).rejects.toThrow(HttpException);
  });

  it('returns retryAfter on throttle', async () => {
    const service = new RateLimitService(noConnection);
    try {
      for (let i = 0; i < 3; i += 1) await service.consume('forgot:ip:mail', 3, 60_000);
    } catch {
      expect.unreachable('first three attempts should pass');
    }
    try {
      await service.consume('forgot:ip:mail', 3, 60_000);
      expect.unreachable('fourth attempt should be blocked');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const response = (error as HttpException).getResponse() as { retryAfter?: number };
      expect(response.retryAfter).toBeGreaterThan(0);
    }
  });

  it('uses the injected Mongo connection in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const counts = new Map<string, number>();
    const collection = {
      updateOne: vi.fn(async (filter: { _id: string; count: { $lt: number } }) => {
        const current = counts.get(filter._id);
        if (current !== undefined && current >= filter.count.$lt) throw Object.assign(new Error('dup'), { code: 11000 });
        counts.set(filter._id, (current ?? 0) + 1);
      }),
      findOne: vi.fn(async (filter: { _id: string }) => (counts.has(filter._id) ? { count: counts.get(filter._id) } : null)),
      deleteOne: vi.fn(async (filter: { _id: string }) => { counts.delete(filter._id); }),
    };
    const connection = { collection: vi.fn(() => collection) };
    const service = new RateLimitService(connection as never);

    await service.consume('login:ip:mail', 2, 60_000);
    await service.consume('login:ip:mail', 2, 60_000);
    await expect(service.consume('login:ip:mail', 2, 60_000)).rejects.toBeInstanceOf(HttpException);
    await expect(service.assertAllowed('login:ip:mail', 2, 60_000)).rejects.toBeInstanceOf(HttpException);
    await service.reset('login:ip:mail', 60_000);
    await expect(service.assertAllowed('login:ip:mail', 2, 60_000)).resolves.toBeUndefined();
    expect(connection.collection).toHaveBeenCalledWith('rate_limit_buckets');
  });
});
