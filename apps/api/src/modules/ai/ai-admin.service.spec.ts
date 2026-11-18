import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Types } from 'mongoose';
import { ROLES_KEY } from '../../common/roles.decorator.js';
import { AdminAiController } from './ai-admin.controller.js';
import { AdminAiJobsQueryDto } from './ai-admin.dto.js';
import { AiAdminService } from './ai-admin.service.js';

const lean = <T>(value: T) => ({ select: () => lean(value), lean: () => ({ exec: async () => value }) });
const exec = <T>(value: T) => ({ exec: async () => value });
const OWNER = new Types.ObjectId();
const PRODUCT = new Types.ObjectId();
const t = (iso: string) => new Date(iso);

function job(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(), ownerId: OWNER, type: 'TRY_ON', productIds: [PRODUCT], state: 'COMPLETED', phase: 'COMPLETED',
    createdAt: t('2026-11-18T01:00:00Z'), startedAt: t('2026-11-18T01:00:10Z'), terminalAt: t('2026-11-18T01:00:40Z'),
    inputKeys: ['private/customer-photo.jpg'], outputKeys: ['out.jpg'], inputMediaId: new Types.ObjectId(),
    renderPlan: { prompt: 'secret prompt' }, heightCm: 170, weightKg: 60, attempts: 1, quotaRefunded: false, ...over,
  };
}

function build(rows: Array<Record<string, unknown>> = [], agg: { states?: unknown[]; timing?: unknown[] } = {}) {
  const find = vi.fn().mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => lean(rows) }) }) });
  const countDocuments = vi.fn().mockReturnValue(exec(rows.length));
  const findById = vi.fn().mockReturnValue(lean(rows[0] ?? null));
  const aggregate = vi.fn().mockReturnValueOnce(exec(agg.states ?? [])).mockReturnValueOnce(exec(agg.timing ?? []));
  const users = { find: vi.fn().mockReturnValue(lean([{ _id: OWNER, fullName: 'Nguyễn A', email: 'a@x.com' }])) };
  const products = { find: vi.fn().mockReturnValue(lean([{ _id: PRODUCT, name: 'Áo dài' }])) };
  const service = new AiAdminService({ find, countDocuments, findById, aggregate } as never, users as never, products as never);
  return { service, find, aggregate };
}

describe('AiAdminService.list', () => {
  it('applies type/state filters and paginates', async () => {
    const { service, find } = build([job()]);
    const res = await service.list(2, 10, { type: 'TRY_ON', state: 'FAILED' });
    expect(find.mock.calls[0][0]).toEqual({ type: 'TRY_ON', state: 'FAILED' });
    expect(res).toMatchObject({ page: 2, limit: 10, total: 1 });
  });

  it('returns customer, product, timings and processing time', async () => {
    const [row] = (await build([job()]).service.list()).items;
    expect(row).toMatchObject({ customerName: 'Nguyễn A', customerEmail: 'a@x.com', productNames: ['Áo dài'],
      startedAt: '2026-11-18T01:00:10.000Z', completedAt: '2026-11-18T01:00:40.000Z', processingMs: 30_000, errorMessage: null });
  });

  it('never exposes input photos, prompts or body measurements', async () => {
    const res = await build([job()]).service.list();
    const json = JSON.stringify(res);
    expect(json).not.toMatch(/customer-photo|inputKeys|inputMediaId|secret prompt|renderPlan|heightCm|weightKg|out\.jpg|outputKeys/);
  });

  it('shortens long error messages and leaves processing time empty when unfinished', async () => {
    const long = 'x'.repeat(500);
    const [row] = (await build([job({ state: 'FAILED', errorMessage: long, startedAt: undefined })]).service.list()).items;
    expect(row.errorMessage?.length).toBe(200);
    expect(row.processingMs).toBeNull();
    const [running] = (await build([job({ state: 'PROCESSING', terminalAt: undefined })]).service.list()).items;
    expect(running.processingMs).toBeNull();
    expect(running.completedAt).toBeNull();
  });
});

describe('AiAdminService.detail', () => {
  it('rejects invalid and unknown ids', async () => {
    await expect(build().service.detail('bad')).rejects.toBeInstanceOf(NotFoundException);
    await expect(build().service.detail(String(new Types.ObjectId()))).rejects.toBeInstanceOf(NotFoundException);
  });
  it('returns one job', async () => {
    const j = job({ state: 'FAILED', errorMessage: 'Provider timeout' });
    expect(await build([j]).service.detail(String(j._id))).toMatchObject({ state: 'FAILED', errorMessage: 'Provider timeout' });
  });
});

describe('AiAdminService.stats', () => {
  it('zero-fills states, totals them and averages recent completed jobs', async () => {
    const { service, aggregate } = build([], { states: [{ _id: 'COMPLETED', count: 7 }, { _id: 'FAILED', count: 2 }, { _id: 'PENDING', count: 1 }],
      timing: [{ avg: 30_000.4, count: 3 }] });
    expect(await service.stats()).toEqual({ total: 10, byState: { PENDING: 1, PROCESSING: 0, COMPLETED: 7, FAILED: 2, EXPIRED: 0 },
      avgProcessingMs: 30_000, avgSampleSize: 3, windowHours: 24 });
    const match = aggregate.mock.calls[1][0][0].$match as { state: string; terminalAt: { $gte: Date } };
    expect(match.state).toBe('COMPLETED');
    expect(Date.now() - match.terminalAt.$gte.getTime()).toBeGreaterThan(23.9 * 3600_000);
  });
  it('returns null average and zeros when there is no data', async () => {
    expect(await build().service.stats()).toMatchObject({ total: 0, avgProcessingMs: null, avgSampleSize: 0 });
  });
});

describe('AdminAiController access and query validation', () => {
  it('is restricted to ADMIN', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminAiController)).toEqual(['ADMIN']);
  });
  it('accepts only known type and state values', () => {
    const ok = plainToInstance(AdminAiJobsQueryDto, { type: 'MIX_MATCH', state: 'FAILED', page: '2' });
    expect(validateSync(ok)).toHaveLength(0);
    expect(validateSync(plainToInstance(AdminAiJobsQueryDto, { type: 'X' }))).not.toHaveLength(0);
    expect(validateSync(plainToInstance(AdminAiJobsQueryDto, { state: 'DONE' }))).not.toHaveLength(0);
  });
});
