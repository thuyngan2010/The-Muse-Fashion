import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import type { Connection } from 'mongoose';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async consume(key: string, limit: number, windowMs: number): Promise<void> {
    const now = Date.now();
    if (this.distributed()) {
      const bucketId = this.bucketId(key, windowMs, now);
      const expiresAt = new Date((Math.floor(now / windowMs) + 1) * windowMs + 60_000);
      try {
        await this.collection().updateOne(
          { _id: bucketId as never, count: { $lt: limit } },
          { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
          { upsert: true },
        );
      } catch (error) {
        if (!(typeof error === 'object' && error && 'code' in error && error.code === 11000)) throw error;
        this.throttled(Math.ceil(((Math.floor(now / windowMs) + 1) * windowMs - now) / 1000));
      }
      return;
    }
    this.prune(now);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (bucket.count >= limit) {
      this.throttled(Math.ceil((bucket.resetAt - now) / 1000));
    }
    bucket.count += 1;
  }

  async assertAllowed(key: string, limit: number, windowMs = 15 * 60_000): Promise<void> {
    if (this.distributed()) {
      const now = Date.now();
      const row = await this.collection().findOne({ _id: this.bucketId(key, windowMs, now) as never });
      if (Number(row?.count ?? 0) >= limit) {
        this.throttled(Math.ceil(((Math.floor(now / windowMs) + 1) * windowMs - now) / 1000));
      }
      return;
    }
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= Date.now()) return;
    if (bucket.count >= limit) {
      this.throttled(Math.ceil((bucket.resetAt - Date.now()) / 1000));
    }
  }

  async reset(key: string, windowMs = 15 * 60_000): Promise<void> {
    if (this.distributed()) {
      await this.collection().deleteOne({ _id: this.bucketId(key, windowMs, Date.now()) as never });
      return;
    }
    this.buckets.delete(key);
  }

  private distributed(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  private collection() {
    return this.connection.collection('rate_limit_buckets');
  }

  private bucketId(key: string, windowMs: number, now: number): string {
    return createHash('sha256').update(`${key}:${windowMs}:${Math.floor(now / windowMs)}`).digest('hex');
  }

  private throttled(retryAfter: number): never {
    throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many requests', retryAfter: Math.max(1, retryAfter) },
      HttpStatus.TOO_MANY_REQUESTS);
  }

  private prune(now: number): void {
    if (this.buckets.size < 5000) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
