import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import { SystemSetting } from '../admin/admin.schemas.js';
import { AiQuota } from './ai.schemas.js';
import { AI_QUOTA_TYPE, nextUtcDayStart, utcDayStart } from './ai-quota.util.js';

const DEFAULT_DAILY_JOBS = 5;

@Injectable()
export class AiQuotaService {
  constructor(
    @InjectModel(AiQuota.name) private readonly quotas: Model<AiQuota>,
    @InjectModel(SystemSetting.name) private readonly settings: Model<SystemSetting>,
  ) {}

  async getDailyLimit(session?: ClientSession): Promise<number> {
    const row = await this.settings.findOne({ key: 'aiDailyJobs' }).session(session ?? null).lean().exec();
    const value = Number(row?.value ?? DEFAULT_DAILY_JOBS);
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : DEFAULT_DAILY_JOBS;
  }

  windowStart(at = new Date()): Date {
    return utcDayStart(at);
  }

  /**
   * Must run inside the transaction that persists the charged job, so the increment and the job
   * commit or roll back together.
   */
  async reserve(ownerId: string, session: ClientSession, at = new Date()): Promise<{ windowStart: Date; limit: number }> {
    const limit = await this.getDailyLimit(session);
    if (limit < 1) this.exceeded(at, 'AI jobs are disabled');
    const windowStart = utcDayStart(at);
    const existing = await this.quotas.findOne({ ownerId, type: AI_QUOTA_TYPE, windowStart }).session(session).lean().exec();
    if (existing && existing.used >= limit) this.exceeded(at, 'Daily AI quota exceeded');
    try {
      await this.quotas.updateOne(
        { ownerId, type: AI_QUOTA_TYPE, windowStart, used: { $lt: limit } },
        { $inc: { used: 1 } },
        { upsert: true, setDefaultsOnInsert: false, session },
      ).exec();
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) this.exceeded(at, 'Daily AI quota exceeded');
      throw error;
    }
    return { windowStart, limit };
  }

  async release(ownerId: string, windowStart: Date, session: ClientSession): Promise<void> {
    await this.quotas.updateOne(
      { ownerId, type: AI_QUOTA_TYPE, windowStart, used: { $gt: 0 } },
      { $inc: { used: -1 } },
      { session },
    ).exec();
  }

  private exceeded(at: Date, message: string): never {
    throw new HttpException(
      { code: 'QUOTA_EXCEEDED', message, retryAfter: Math.ceil((nextUtcDayStart(at).getTime() - Date.now()) / 1000) },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
