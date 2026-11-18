import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog.service.js';

const CAT_ID = '64b7f0c2a1b2c3d4e5f60718';
const lean = <T>(value: T) => ({ lean: () => ({ exec: async () => value }) });

function build(opts: { category?: unknown; skuRows?: Array<{ productId: string }> } = {}) {
  const find = vi.fn().mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => lean([]) }) }) });
  const countDocuments = vi.fn().mockReturnValue({ exec: async () => 0 });
  const findOne = vi.fn().mockReturnValue(lean(opts.category ?? null));
  const variantFind = vi.fn().mockReturnValue({ select: () => lean(opts.skuRows ?? []) });
  const service = new CatalogService({ find, countDocuments } as never, { findOne } as never, { find: variantFind } as never,
    {} as never, {} as never, {} as never, {} as never);
  return { service, find, findOne, variantFind };
}

describe('CatalogService.listAdmin search', () => {
  it('matches name or variant SKU case-insensitively and escapes input', async () => {
    const { service, find, variantFind } = build({ skuRows: [{ productId: 'p1' }, { productId: 'p1' }, { productId: 'p2' }] });
    await service.listAdmin('PUBLISHED', 1, 20, { q: 'ao.(x' });
    const skuRe = (variantFind.mock.calls[0][0] as { sku: RegExp }).sku;
    expect(skuRe.flags).toContain('i');
    expect(skuRe.test('AO.(X-01')).toBe(true);
    expect(skuRe.test('AOZ(X')).toBe(false);
    const filter = find.mock.calls[0][0] as { status: string; $or: Array<Record<string, unknown>> };
    expect(filter.status).toBe('PUBLISHED');
    expect(filter.$or[0]).toHaveProperty('name');
    expect(filter.$or[1]).toEqual({ _id: { $in: ['p1', 'p2'] } });
  });

  it('resolves category by slug or id', async () => {
    const { service, find, findOne } = build({ category: { _id: CAT_ID } });
    await service.listAdmin(undefined, 1, 20, { category: 'Ao-Dai' });
    expect(findOne.mock.calls[0][0]).toEqual({ slug: 'ao-dai' });
    expect(find.mock.calls[0][0]).toEqual({ categoryId: CAT_ID });
    findOne.mockClear();
    await service.listAdmin(undefined, 1, 20, { category: CAT_ID });
    expect(findOne.mock.calls[0][0]).toEqual({ $or: [{ slug: CAT_ID }, { _id: CAT_ID }] });
  });

  it('returns an empty page for an unknown category', async () => {
    const { service, find } = build();
    const res = await service.listAdmin(undefined, 1, 20, { category: 'khong-co' });
    expect(res).toMatchObject({ total: 0, items: [] });
    expect(find).not.toHaveBeenCalled();
  });

  it('keeps the old behaviour with no search params', async () => {
    const { service, find } = build();
    await service.listAdmin('DRAFT');
    expect(find.mock.calls[0][0]).toEqual({ status: 'DRAFT' });
  });
});
