import { HttpException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiQuotaService } from './ai-quota.service.js';
import { AI_QUOTA_EXCEEDED_MESSAGE, AI_TOTAL_QUOTA_TYPE, totalDailyLimit } from './ai-quota.util.js';

const chain = (value: unknown) => ({ session: () => ({ lean: () => ({ exec: async () => value }) }) });

function build(options: { perUserUsed?: number; dailyJobs?: number; totalUpdate?: () => Promise<unknown> } = {}) {
  const updateOne = vi.fn((filter: { type: string }) => ({
    exec: filter.type === AI_TOTAL_QUOTA_TYPE && options.totalUpdate ? options.totalUpdate : async () => ({ modifiedCount: 1 }),
  }));
  const quotas = { findOne: vi.fn(() => chain(options.perUserUsed === undefined ? null : { used: options.perUserUsed })), updateOne };
  const settings = { findOne: vi.fn(() => chain({ value: options.dailyJobs ?? 5 })) };
  return { service: new AiQuotaService(quotas as never, settings as never), updateOne };
}

async function rejection(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e) as HttpException;
  expect(error).toBeInstanceOf(HttpException);
  expect(error.getStatus()).toBe(429);
  return error.getResponse() as { code: string; message: string };
}

afterEach(() => vi.unstubAllEnvs());

describe('AI daily limits (budget protection)', () => {
  it('reserves both the customer quota and the system-wide total', async () => {
    const { service, updateOne } = build();
    await service.reserve('64b000000000000000000001', {} as never);
    expect(updateOne.mock.calls.map(([filter]) => (filter as { type: string }).type)).toEqual(['DAILY_COMBINED', AI_TOTAL_QUOTA_TYPE]);
    expect((updateOne.mock.calls[1][0] as { used: { $lt: number } }).used).toEqual({ $lt: 40 });
  });

  it('answers in Vietnamese when the customer used all daily tries', async () => {
    const { service } = build({ perUserUsed: 5, dailyJobs: 5 });
    expect(await rejection(service.reserve('64b000000000000000000001', {} as never)))
      .toMatchObject({ code: 'QUOTA_EXCEEDED', message: AI_QUOTA_EXCEEDED_MESSAGE });
  });

  it('stops before any paid call once the system-wide total for today is reached', async () => {
    vi.stubEnv('AI_DAILY_LIMIT_TOTAL', '3');
    const { service, updateOne } = build({ totalUpdate: async () => { throw Object.assign(new Error('dup'), { code: 11000 }); } });
    expect(await rejection(service.reserve('64b000000000000000000001', {} as never)))
      .toMatchObject({ code: 'QUOTA_EXCEEDED', message: 'Bạn đã dùng hết lượt thử đồ AI hôm nay. Vui lòng quay lại vào ngày mai.' });
    expect((updateOne.mock.calls[1][0] as { used: { $lt: number } }).used).toEqual({ $lt: 3 });
  });

  it('releases the system-wide counter together with the customer counter', async () => {
    const { service, updateOne } = build();
    await service.release('64b000000000000000000001', new Date('2026-11-19T00:00:00Z'), {} as never);
    expect(updateOne.mock.calls.map(([filter]) => (filter as { type: string }).type)).toEqual(['DAILY_COMBINED', AI_TOTAL_QUOTA_TYPE]);
  });

  it('parses AI_DAILY_LIMIT_TOTAL with a safe default', () => {
    expect(totalDailyLimit(undefined)).toBe(40);
    expect(totalDailyLimit('')).toBe(40);
    expect(totalDailyLimit('12')).toBe(12);
    expect(totalDailyLimit('0')).toBe(0);
    expect(totalDailyLimit('-1')).toBe(40);
    expect(totalDailyLimit('abc')).toBe(40);
  });
});
